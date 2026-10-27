import { env } from "@/lib/env";
import type { Db } from "@/server/db/client";
import { trustedClientAddress } from "@/server/auth/client-address";
import { hashPhone, normalizeE164 } from "@/server/auth/phone-hash";
import { generateShareSlug } from "@/server/auth/slug";
import { checkGateThrottle } from "@/server/auth/throttle";
import { issueSession, sessionCookie } from "@/server/auth/session";

/**
 * RN-B (create-only, per the owner's Wave 0 answer to RN-D G1) + the RN-C
 * create path.
 *
 * The lookup half never reads a registry and never renders an existing
 * circle: it takes a number, and always answers 200 with the same offer to
 * create a proxy registry. One body for registered, unregistered and invalid
 * input, so the response is not an existence oracle in status, wording, size
 * or error string. No lookup body contains a share slug or a /c/ href
 * (RN-D M-no-slug), and no raw number is echoed or logged.
 *
 * The create half mints a proxy circle (RN-A D2/D3): no owner, the recipient
 * stored only as a keyed digest plus a pending allowlist row, the creator a
 * plain friend member. Per-creator caps live in the database, not the
 * in-process throttle map (RN-D Gate 4).
 */

const NO_STORE = "private, no-store, max-age=0, must-revalidate";
const MAX_PROXY_PER_CREATOR_PER_DAY = 10;

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Cache-Control": NO_STORE,
    "Referrer-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    ...extra,
  };
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

/** The single lookup answer. Static by design: identical bytes for every input. */
function offerBody(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow"><title>Start a gift circle</title></head>
<body><main>
<h1>Start a gift circle for someone</h1>
<p>Gift circles here begin with a link shared in your group chat. If the person
you are buying for does not have a circle yet, you can start a once-off one for
them: they are never notified, and no account is created for them.</p>
<form method="post" action="/lookup">
<input type="hidden" name="intent" value="create">
<label>Your name <input name="creatorName" maxlength="80" required></label>
<label>Your number (international form) <input name="creatorPhone" required></label>
<label>Their number (international form) <input name="recipientPhone" required></label>
<label>Their name, as the group knows them <input name="recipientLabel" maxlength="80" required></label>
<label>Occasion <input name="occasion" maxlength="80" required></label>
<label>The day <input type="date" name="eventDate" required></label>
<label>The gift <input name="itemTitle" maxlength="120" required></label>
<button type="submit">Create the circle</button>
</form>
</main></body></html>`;
}

function offer(extra: Record<string, string> = {}): Response {
  return new Response(offerBody(), {
    status: 200,
    headers: headers({ "Content-Type": "text/html; charset=utf-8", ...extra }),
  });
}

async function readForm(request: Request): Promise<FormData> {
  return request.formData();
}

export async function handleLookupPost(db: Db, request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await readForm(request);
  } catch {
    return offer();
  }

  const intent = String(form.get("intent") ?? "lookup");
  const keyPhoneRaw = String(form.get(intent === "create" ? "recipientPhone" : "phone") ?? "");
  const normalizedKey = normalizeE164(keyPhoneRaw);
  const pepper = env.PHONE_HASH_PEPPER;
  const hashPart = normalizedKey ? hashPhone(normalizedKey, pepper) : "invalid";
  const throttleKey = `${hashPart}:${trustedClientAddress(request)}`;

  // The throttle runs before any database read, for successes and failures
  // alike; a denial is the same body plus Retry-After (RN-D SS5).
  const gate = checkGateThrottle(throttleKey);
  if (!gate.allowed) return offer({ "Retry-After": String(gate.retryAfter) });

  if (intent !== "create") return offer();

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
