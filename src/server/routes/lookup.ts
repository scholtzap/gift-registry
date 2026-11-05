import { env } from "@/lib/env";
import type { Db } from "@/server/db/client";
import { trustedClientAddress } from "@/server/auth/client-address";
import { isSameOrigin } from "@/server/auth/same-origin";
import { hashPhone, normalizeE164 } from "@/server/auth/phone-hash";
import { classifyIdentifier, hashEmail } from "@/server/auth/email-hash";
import { generateShareSlug } from "@/server/auth/slug";
import { gateThrottle } from "@/server/auth/throttle-store";
import { checkTurnstile, turnstileField } from "@/server/auth/turnstile";
import { issueSession, sessionCookie } from "@/server/auth/session";
import { createElement, type ComponentType } from "react";
import { createRequire } from "node:module";
import {
  LookupResultScreen, LookupSearchScreen, ProxyOfferScreen, type PublicCircleHit,
} from "@/components/screens/lookup";
import { CONTENT_SECURITY_POLICY, page, escapeHtml } from "@/server/routes/shell";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as typeof import("react-dom/server");

/**
 * Lookup + proxy create (flow-simplification / post-hackathon round-off).
 *
 * Lookup returns one 200 shell for hit and miss: a public-circles list (empty
 * or filled) plus the same proxy CTA. Create still mints a proxy circle
 * (RN-A D2/D3). No distinct “not registered” wording.
 */

const NO_STORE = "private, no-store, max-age=0, must-revalidate";
const BASE = process.env.PINATA_BASE_PATH ?? "";
const MAX_PROXY_PER_CREATOR_PER_DAY = 10;

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

/** Uniform result: same shell whether publicCircles is empty or not. */
function resultBody(publicCircles: PublicCircleHit[]): string {
  return page(
    "Circles you can open",
    renderToStaticMarkup(createElement(LookupResultScreen as ComponentType<{ basePath?: string; publicCircles: PublicCircleHit[] }>, { basePath: BASE, publicCircles })),
  );
}

function result(publicCircles: PublicCircleHit[] = [], extra: Record<string, string> = {}): Response {
  return new Response(resultBody(publicCircles), {
    status: 200,
    headers: headers({ "Content-Type": "text/html; charset=utf-8", ...extra }),
  });
}

/** Create-path refusals fold into the empty-result shell (same status/shape). */
function offer(extra: Record<string, string> = {}): Response {
  return result([], extra);
}

async function discoverableCirclesForIdentifier(db: Db, raw: string, pepper: string): Promise<PublicCircleHit[]> {
  const id = classifyIdentifier(raw);
  if (!id) return [];
  const user = id.kind === "email"
    ? await db.prisma.user.findFirst({
      where: { emailHash: hashEmail(id.normalized, pepper) },
      select: { id: true },
    })
    : await db.prisma.user.findFirst({
      where: { phoneE164: id.normalized },
      select: { id: true },
    });
  if (!user) return [];
  const rows = await db.prisma.circle.findMany({
    where: {
      status: "active",
      discoverable: true,
      OR: [
        { ownerUserId: user.id },
        { memberships: { some: { userId: user.id, status: "active" } } },
      ],
    },
    orderBy: [{ eventDate: "asc" }, { name: "asc" }],
    select: { name: true, occasion: true, shareSlug: true },
    take: 24,
  });
  return rows.map((row) => ({ name: row.name, occasion: row.occasion, shareSlug: row.shareSlug }));
}

async function readForm(request: Request): Promise<FormData> {
  return request.formData();
}

/**
 * The demo (and any human) starts here: a plain search form. It carries no
 * data about anyone, so it is the same bytes for every visitor, no-store and
 * noindex like every registry surface. The number typed here travels only in
 * the POST body that follows, never in a URL.
 */
export function handleLookupGet(): Response {
  const body = page("Find a gift circle", renderToStaticMarkup(createElement(LookupSearchScreen as ComponentType<{ basePath?: string }>, { basePath: BASE })));
  return new Response(body, {
    status: 200,
    headers: headers({ "Content-Type": "text/html; charset=utf-8" }),
  });
}

export async function handleLookupPost(db: Db, request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await readForm(request);
  } catch {
    return offer();
  }

  const intent = String(form.get("intent") ?? "lookup");
  // Session-issuing branch only: the plain lookup answers the same 200 body
  // either way and mints nothing, so CSRF is a non-issue there. The create
  // branch mints a 14-day session and gets the same bar as the circle gate
  // (F1); denial folds into the uniform offer body so the oracle stays shut.
  if (intent === "create" && !isSameOrigin(request)) return offer();
  // Human-proof gate (F12): folds into the uniform offer body, so the check
  // cannot be probed apart from any other refusal. Open seam until set.
  if (intent === "create" && !(await checkTurnstile(request, turnstileField(form)))) return offer();
  const pepper = env.PHONE_HASH_PEPPER;
  const keyRaw = intent === "create"
    ? String(form.get("recipientPhone") ?? "")
    : String(form.get("identifier") ?? form.get("phone") ?? "");
  const classified = classifyIdentifier(keyRaw);
  const hashPart = classified
    ? (classified.kind === "email" ? hashEmail(classified.normalized, pepper) : hashPhone(classified.normalized, pepper))
    : "invalid";

  // The throttle runs before any database read, for successes and failures
  // alike; a denial is the same body plus Retry-After (RN-D SS5).
  const lookupAddress = trustedClientAddress(request);
  const gate = await gateThrottle(db, [
    `lookup:${hashPart}:${lookupAddress}`,
    { key: `lookup-addr:${lookupAddress}`, max: 60 },
    { key: `gate-number:${hashPart}`, max: 20 },
  ]);
  if (!gate.allowed) return offer({ "Retry-After": String(gate.retryAfter) });

  if (intent !== "create") {
    const publicCircles = await discoverableCirclesForIdentifier(db, keyRaw, pepper);
    return result(publicCircles);
  }

  const creatorName = String(form.get("creatorName") ?? "").trim();
  const creatorPhone = normalizeE164(String(form.get("creatorPhone") ?? ""));
  const recipientPhone = normalizeE164(String(form.get("recipientPhone") ?? ""));
  const recipientLabel = String(form.get("recipientLabel") ?? "").trim();
  const occasion = String(form.get("occasion") ?? "").trim();
  const itemTitle = String(form.get("itemTitle") ?? "").trim();
  const eventDateRaw = String(form.get("eventDate") ?? "");
  const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(eventDateRaw) ? new Date(`${eventDateRaw}T00:00:00.000Z`) : null;

  if (
    !creatorName || creatorName.length > 80 || !creatorPhone || !recipientPhone ||
    !recipientLabel || recipientLabel.length > 80 || !occasion || occasion.length > 80 ||
    !itemTitle || itemTitle.length > 120 || !eventDate || Number.isNaN(eventDate.getTime())
  ) {
    return offer();
  }

  try {
    const recipientHash = hashPhone(recipientPhone, pepper);
    const result = await db.prisma.$transaction(async (tx) => {
      const creator = await tx.user.upsert({
        where: { phoneE164: creatorPhone },
        create: { phoneE164: creatorPhone, displayName: creatorName },
        update: { displayName: creatorName },
      });
      // Per-creator cap in the database (RN-D Gate 4). Refusal is the same
      // offer body, never a distinct error.
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await tx.circle.count({
        where: { proxyCreatedByUserId: creator.id, createdAt: { gte: since } },
      });
      if (recent >= MAX_PROXY_PER_CREATOR_PER_DAY) return null;

      const slug = generateShareSlug();
      const circle = await tx.circle.create({
        data: {
          name: `${recipientLabel} - ${occasion}`,
          occasion,
          eventDate,
          ownerUserId: null,
          recipientLabel,
          recipientPhoneE164Hash: recipientHash,
          proxyCreatedByUserId: creator.id,
          shareSlug: slug,
          memberships: { create: [{ userId: creator.id, role: "friend", status: "active" }] },
          allowlist: {
            create: [{ phoneE164Hash: recipientHash, addedBy: creator.id, status: "pending" }],
          },
          items: {
            create: [{
              addedByUserId: creator.id,
              title: itemTitle,
              visibility: "friend_only",
              confirmed: true,
            }],
          },
        },
      });
      const session = issueSession({ userId: creator.id, circleId: circle.id, role: "friend" });
      return { slug, session };
    });
    if (!result) return offer();
    const expiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    return new Response(null, {
      status: 303,
      headers: headers({
        Location: `/c/${encodeURIComponent(result.slug)}`,
        "Set-Cookie": sessionCookie(result.session, expiry),
      }),
    });
  } catch {
    // Lookup errors fold into the same 200 body (RN-D: no error-string oracle).
    return offer();
  }
}

export { escapeHtml };
