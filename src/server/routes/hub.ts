import { createElement } from "react";
import { createRequire } from "node:module";
import { env } from "@/lib/env";
import type { Actor, Db } from "@/server/db/client";
import { trustedClientAddress } from "@/server/auth/client-address";
import { isSameOrigin } from "@/server/auth/same-origin";
import { hashPhone, normalizeE164 } from "@/server/auth/phone-hash";
import { hashEmail, normalizeEmail } from "@/server/auth/email-hash";
import { gateThrottle } from "@/server/auth/throttle-store";
import { checkTurnstile, turnstileField } from "@/server/auth/turnstile";
import { issueSession, sessionCookie } from "@/server/auth/session";
import { addItem, createCircle } from "@/server/ledger"; // shareSlug omitted: ledger derives it
import { HubScreen } from "@/components/screens/hub";
import { CONTENT_SECURITY_POLICY, page } from "@/server/routes/shell";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as typeof import("react-dom/server");

/**
 * CR-UX-01 hub writes. Create-my-circle reuses the ledger `createCircle`
 * path and the existing signed owner-session issuance — no new auth model.
 * Phone handling matches the proxy flow: the user row keys on the E.164
 * number, and only its keyed hash reaches the circle's invite list.
 * `/c/<slug>` does not move; the redirect is basePath-aware so production
 * (PINATA_BASE_PATH=/app) lands on /app/c/<slug> and dev/tests on /c/<slug>.
 */

const NO_STORE = "private, no-store, max-age=0, must-revalidate";
const BASE = process.env.PINATA_BASE_PATH ?? "";

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Cache-Control": NO_STORE,
    "Referrer-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    ...extra,
  };
}

function hubForm(notice: string, initial: { name?: string; occasion?: string; eventDate?: string; email?: string; wish?: string }): Response {
  const body = page("Start your circle", renderToStaticMarkup(createElement(HubScreen, { basePath: BASE, notice, initial })));
  return new Response(body, { status: 422, headers: headers({ "Content-Type": "text/html; charset=utf-8" }) });
}

export async function handleHubCreatePost(db: Db, request: Request): Promise<Response> {
  // Session-issuing POST: same login-CSRF bar as the circle gate (F1). A
  // cross-origin form POST must never mint a session, even though SameSite=Lax
  // is set on the cookie.
  if (!isSameOrigin(request)) {
    return hubForm("That submission could not be verified as coming from this page. Open the link again and try.", {});
  }
  let form: FormData;
  try { form = await request.formData(); } catch { return hubForm("Something was missing. Check the form and try again.", {}); }

  const name = String(form.get("name") ?? "").trim();
  const occasion = String(form.get("occasion") ?? "").trim();
  const eventDateRaw = String(form.get("eventDate") ?? "").trim();
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const phoneRaw = String(form.get("phone") ?? "").trim();
  const phone = phoneRaw ? normalizeE164(phoneRaw) : null;
  const wish = String(form.get("wish") ?? "").trim();
  const initial = { name, occasion, eventDate: eventDateRaw, email: email ?? String(form.get("email") ?? "").trim(), wish };
  const invalid = "Check the form: your name, occasion and email are needed. A phone number, if you add one, starts with +.";

  if (!name || name.length > 80 || !occasion || occasion.length > 80 || !email || (phoneRaw !== "" && !phone) || wish.length > 120) {
    return hubForm(invalid, initial);
  }
  if (eventDateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(eventDateRaw)) return hubForm(invalid, initial);

  // Human-proof gate (F12): same invalid-form answer as a bad field, so the
  // check cannot be probed apart. Open seam until TURNSTILE_SECRET is set.
  if (!(await checkTurnstile(request, turnstileField(form)))) {
    return hubForm(invalid, initial);
  }

  const pepper = env.PHONE_HASH_PEPPER;
  const emailHash = hashEmail(email, pepper);
  const phoneHash = phone ? hashPhone(phone, pepper) : undefined;
  const hubAddress = trustedClientAddress(request);
  const gate = await gateThrottle(db, [
    `hub-create:${phoneHash ?? emailHash}:${hubAddress}`,
    { key: `hub-create-addr:${hubAddress}`, max: 60 },
    ...(phoneHash ? [{ key: `gate-number:${phoneHash}`, max: 20 }] : []),
  ]);
  if (!gate.allowed) {
    return new Response(
      page("Start your circle", renderToStaticMarkup(createElement(HubScreen, { basePath: BASE, notice: "Too many tries. Wait a minute and try again.", initial }))),
      { status: 429, headers: headers({ "Content-Type": "text/html; charset=utf-8", "Retry-After": String(gate.retryAfter) }) },
    );
  }

  // Optional party date: absent means a placeholder a month out that the
  // owner updates from their ledger (the ledger requires a date).
  const eventDate = eventDateRaw
    ? new Date(`${eventDateRaw}T00:00:00.000Z`)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(eventDate.getTime())) return hubForm(invalid, initial);

  try {
    const byEmail = await db.prisma.user.findUnique({ where: { emailHash }, select: { id: true } });
    const byPhone = phone
      ? await db.prisma.user.findUnique({ where: { phoneE164: phone }, select: { id: true, email: true } })
      : null;
    if (byEmail && byPhone && byEmail.id !== byPhone.id) return hubForm(invalid, initial);
    if (byPhone?.email && byPhone.email !== email) return hubForm(invalid, initial);
    const user = byEmail
      ? await db.prisma.user.update({
        where: { id: byEmail.id },
        data: { displayName: name, ...(phone ? { phoneE164: phone } : {}) },
      })
      : byPhone
        ? await db.prisma.user.update({
          where: { id: byPhone.id },
          data: { displayName: name, email, emailHash },
        })
        : await db.prisma.user.create({
          data: { displayName: name, email, emailHash, ...(phone ? { phoneE164: phone } : {}) },
        });
    const actor: Actor = { role: "owner", userId: user.id, circleId: null, phoneHash };
    const circle = await db.withActor(actor, (tx) => createCircle(tx, actor, {
      name: `${name} — ${occasion}`,
      occasion,
      eventDate,
    }));
    if (String(form.get("discoverable") ?? "") === "on") {
      await db.prisma.circle.update({ where: { id: circle.id }, data: { discoverable: true } });
    }
    if (wish) {
      const owner: Actor = { ...actor, circleId: circle.id };
      await db.withActor(owner, (tx) => addItem(tx, owner, { title: wish }));
    }
    const session = issueSession({ userId: user.id, circleId: circle.id, role: "owner" });
    const expiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    return new Response(null, {
      status: 303,
      headers: headers({
        Location: `${BASE}/c/${encodeURIComponent(circle.shareSlug)}`,
        "Set-Cookie": sessionCookie(session, expiry),
      }),
    });
  } catch {
    return hubForm("We could not create your circle just now. Check the form and try again.", initial);
  }
}
