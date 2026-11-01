import { createElement } from "react";
import { createRequire } from "node:module";
import { env } from "@/lib/env";
import type { Actor, Db } from "@/server/db/client";
import { trustedClientAddress } from "@/server/auth/client-address";
import { isSameOrigin } from "@/server/auth/same-origin";
import { hashPhone, normalizeE164 } from "@/server/auth/phone-hash";
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

function hubForm(notice: string, initial: { name?: string; occasion?: string; eventDate?: string; wish?: string }): Response {
  const body = page("Start your circle", renderToStaticMarkup(createElement(HubScreen, { basePath: BASE, notice, initial })));
  return new Response(body, { status: 422, headers: headers({ "Content-Type": "text/html; charset=utf-8" }) });
}

/** Extract a share slug from a pasted link, a path, or a bare slug. No lookup: `/c/` decides existence. */
export function parseCircleSlug(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withoutQuery = trimmed.split(/[?#]/)[0] ?? "";
  const marker = "/c/";
  const at = withoutQuery.indexOf(marker);
  const candidate = (at >= 0 ? withoutQuery.slice(at + marker.length) : withoutQuery)
    .split("/").filter(Boolean).pop() ?? "";
  let decoded: string;
  try { decoded = decodeURIComponent(candidate); } catch { return null; }
  return /^[A-Za-z0-9_-]{1,64}$/.test(decoded) ? decoded : null;
}

export async function handleHubOpenPost(db: Db, request: Request): Promise<Response> {
  // No session is issued here, but the path fans out to link-expand + model
  // spend, so it shares the gate throttle (address-only + payload-hash keys,
  // shared across processes behind the proxy via `gateThrottle`).
  const preAddress = trustedClientAddress(request);
  const preGate = await gateThrottle(db, [{ key: `hub-open:${preAddress}`, max: 60 }]);
  if (!preGate.allowed) {
    return new Response(
      page("Start your circle", renderToStaticMarkup(createElement(HubScreen, { basePath: BASE, notice: "Too many tries. Wait a minute and try again.", initial: {} }))),
      { status: 429, headers: headers({ "Content-Type": "text/html; charset=utf-8", "Retry-After": String(preGate.retryAfter) }) },
    );
  }
  let form: FormData;
  try { form = await request.formData(); } catch { return hubForm("Paste your circle link, or type the code at the end of it.", {}); }
  const payloadGate = await gateThrottle(db, [
    { key: `hub-open:${preAddress}`, max: 60 },
    `hub-open-link:${preAddress}:${Buffer.from(String(form.get("link") ?? "").trim().slice(0, 64)).toString("base64url")}`,
  ]);
  if (!payloadGate.allowed) {
    return new Response(
      page("Start your circle", renderToStaticMarkup(createElement(HubScreen, { basePath: BASE, notice: "Too many tries. Wait a minute and try again.", initial: {} }))),
      { status: 429, headers: headers({ "Content-Type": "text/html; charset=utf-8", "Retry-After": String(payloadGate.retryAfter) }) },
    );
  }
  const slug = parseCircleSlug(String(form.get("link") ?? ""));
  if (!slug) return hubForm("That does not look like a circle link. Paste the full link from your WhatsApp group.", {});
  return new Response(null, { status: 303, headers: headers({ Location: `${BASE}/c/${encodeURIComponent(slug)}` }) });
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
  const phone = normalizeE164(String(form.get("phone") ?? ""));
  const wish = String(form.get("wish") ?? "").trim();
  const initial = { name, occasion, eventDate: eventDateRaw, wish };
  const invalid = "Check the form: your name, occasion and a WhatsApp number in international form (starting with +) are needed.";

  if (!name || name.length > 80 || !occasion || occasion.length > 80 || !phone || wish.length > 120) {
    return hubForm(invalid, initial);
  }
  if (eventDateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(eventDateRaw)) return hubForm(invalid, initial);

  // Human-proof gate (F12): same invalid-form answer as a bad field, so the
  // check cannot be probed apart. Open seam until TURNSTILE_SECRET is set.
  if (!(await checkTurnstile(request, turnstileField(form)))) {
    return hubForm(invalid, initial);
  }

  const pepper = env.PHONE_HASH_PEPPER;
  const phoneHash = hashPhone(phone, pepper);
  const hubAddress = trustedClientAddress(request);
  const gate = await gateThrottle(db, [
    `hub-create:${phoneHash}:${hubAddress}`,
    { key: `hub-create-addr:${hubAddress}`, max: 60 },
    { key: `gate-number:${phoneHash}`, max: 20 },
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
    const user = await db.prisma.user.upsert({
      where: { phoneE164: phone },
      create: { phoneE164: phone, displayName: name },
      update: { displayName: name },
    });
    const actor: Actor = { role: "owner", userId: user.id, circleId: null, phoneHash };
    const circle = await db.withActor(actor, (tx) => createCircle(tx, actor, {
      name: `${name} — ${occasion}`,
      occasion,
      eventDate,
    }));
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
