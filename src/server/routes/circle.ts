import type { Db } from "@/server/db/client";
import { friendCircleView, ownerCircleView } from "@/server/views";
import { hashPhone, normalizeE164 } from "@/server/auth/phone-hash";
import { issueSession, sessionCookie, sessionFromRequest } from "@/server/auth/session";
import { env } from "@/lib/env";

/**
 * `/c/<slug>` — the one URL that gets pasted into a WhatsApp group, and the reason the app has
 * two projections instead of one. This module is deliberately framework-free and takes its `Db`
 * as an argument: `src/app/c/[slug]/route.ts` is a six-line adapter over it, so the role split
 * is testable against the test database without booting Next, and swapping the adapter for a
 * styled `page.tsx` later changes nothing here.
 *
 * Three rules this file exists to not break:
 *
 * 1. **404, never 403.** "Not yours" and "does not exist" produce the identical response. A 403
 *    tells a curious caller that something is in there, which is the first half of a leak.
 * 2. **Never cacheable.** One URL, two projections. A shared or proxy cache that stored the
 *    owner's response would serve it to a friend and vice versa, so every response here is
 *    `private, no-store` — including the gate and the 404.
 * 3. **The gate writes only after it has authorised.** The allowlist hash match happens before
 *    any row is created, and the write path runs as the login role because a person who is not
 *    a member yet has no RLS rights to exercise.
 */

const NO_STORE = "private, no-store, max-age=0, must-revalidate";

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { "Cache-Control": NO_STORE, ...extra };
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

function notFound(): Response {
  // Same body, same status, same headers for every kind of no.
  return new Response(page("Not found", "<p>That circle link is not valid.</p>"), {
    status: 404,
    headers: headers({ "Content-Type": "text/html; charset=utf-8" }),
  });
}

/** Pre-brand placeholder markup. `docs/plans/design-system-and-brand.md` replaces the shell;
 *  the role split underneath it is what the tests pin, not the elements. */
function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title></head>
<body style="font-family:system-ui,sans-serif;margin:0 auto;max-width:38rem;padding:1.5rem;line-height:1.5">
${body}</body></html>`;
}

function gateForm(notice?: string): Response {
  // Nothing user-supplied is echoed back, so there is nothing here to escape. The form posts to
  // the same URL, which keeps the slug out of the markup entirely.
  return new Response(
    page(
      "Join this circle",
      `<h1>Join this circle</h1>
${notice ? `<p role="alert">${escapeHtml(notice)}</p>` : ""}
<form method="post" action="">
  <label for="name">Your name<p style="margin:.25rem 0;color:#555;font-size:.875rem">Shown to the group on the card.</p></label>
  <input id="name" name="name" autocomplete="name" required maxlength="80" style="display:block;width:100%;padding:.5rem;margin:.25rem 0 1rem">
  <label for="phone">WhatsApp number<p style="margin:.25rem 0;color:#555;font-size:.875rem">In full international form: a plus, the country code, then the number. Only checked against this circle&#39;s invite list — stored there as a keyed hash, never as digits.</p></label>
  <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required maxlength="20" style="display:block;width:100%;padding:.5rem;margin:.25rem 0 1rem">
  <button type="submit" style="padding:.6rem 1.2rem;font-size:1rem">Continue</button>
</form>
<p style="color:#555;font-size:.875rem">Not on the list? Ask the person who shared this link to add you.</p>`,
    ),
    { status: 200, headers: headers({ "Content-Type": "text/html; charset=utf-8" }) },
  );
}

function itemRow(title: string, meta: string[]): string {
  return `<li><strong>${escapeHtml(title)}</strong>${meta.length ? ` <span style="color:#555">— ${meta.map(escapeHtml).join(" · ")}</span>` : ""}</li>`;
}

function renderOwner(view: NonNullable<Awaited<ReturnType<typeof ownerCircleView>>>): Response {
  const items = view.items.length
    ? `<ul>${view.items.map((i) => itemRow(i.title, [i.price ?? "no price", i.confirmed ? "confirmed" : "not confirmed"])).join("")}</ul>`
    : "<p>No gifts listed yet.</p>";

  return new Response(
    page(
      view.name,
      `<h1>${escapeHtml(view.name)}</h1>
<p>${escapeHtml(view.occasion)} · ${escapeHtml(view.eventDate)}</p>
<p style="color:#555;font-size:.875rem">Your list. What the group does with it is theirs.</p>
${items}
${view.attributes.length ? `<h2>About you</h2><ul>${view.attributes.map((a) => itemRow(a.kind, [a.valueText])).join("")}</ul>` : ""}`,
    ),
    { status: 200, headers: headers({ "Content-Type": "text/html; charset=utf-8" }) },
  );
}

function renderFriend(view: NonNullable<Awaited<ReturnType<typeof friendCircleView>>>): Response {
  const items = view.items.length
    ? `<ul>${view.items
        .map((i) => {
          const meta: string[] = [];
          if (i.price) meta.push(i.price);
          if (i.status === "tombstoned") meta.push("no longer wanted");
          if (i.secret) meta.push("hidden from them");
          if (i.claimedByMe) meta.push("you claimed this");
          else if (i.addedByMe) meta.push("you suggested this");
          if (i.pool) meta.push(`pool ${i.pool.settled} of ${i.pool.target} · ${i.pool.contributors} contributing`);
          return itemRow(i.title, meta);
        })
        .join("")}</ul>`
    : "<p>Nothing listed yet.</p>";

  return new Response(
    page(
      view.name,
      `<h1>${escapeHtml(view.name)}</h1>
<p>${escapeHtml(view.occasion)} · ${escapeHtml(view.eventDate)}</p>
${items}
${view.attributes.length ? `<h2>Helpful to know</h2><ul>${view.attributes.map((a) => itemRow(a.kind, [a.valueText])).join("")}</ul>` : ""}`,
    ),
    { status: 200, headers: headers({ "Content-Type": "text/html; charset=utf-8" }) },
  );
}

export async function handleCircleGet(db: Db, request: Request, slug: string): Promise<Response> {
  // Unscoped on purpose, and the only read in this file that is: the actor is not known yet, so
  // there is no role to switch into. It selects the id and nothing else — no name, no owner, no
  // row that implies a person. Everything a caller can see comes from the scoped read below.
  const circle = await db.prisma.circle.findUnique({ where: { shareSlug: slug }, select: { id: true } });
  if (!circle) return notFound();

  const session = sessionFromRequest(request);
  // A session minted for a different circle is not a session for this one. Treating it as one
  // would be the bug that lets a forwarded link read someone else's group.
  if (!session || session.circleId !== circle.id) return gateForm();

  // Two branches rather than one ternary over the role: the owner and the friend get different
  // builders with different signatures, and collapsing them into a union is how a route ends up
  // handing one role's payload to the other role's renderer.
  if (session.role === "owner") {
    const view = await db.withActor({ role: "owner", userId: session.userId, circleId: circle.id }, (tx) =>
      ownerCircleView(tx, circle.id),
    );
    return view === null ? notFound() : renderOwner(view);
  }

  const view = await db.withActor({ role: "friend", userId: session.userId, circleId: circle.id }, (tx) =>
    friendCircleView(tx, circle.id, session.userId),
  );
  // Null means "not visible to this role", which is the same answer as "does not exist".
  return view === null ? notFound() : renderFriend(view);
}

export async function handleCirclePost(db: Db, request: Request, slug: string): Promise<Response> {
  const circle = await db.prisma.circle.findUnique({ where: { shareSlug: slug }, select: { id: true } });
  if (!circle) return notFound();

  let name = "";
  let phone = "";
  try {
    const form = await request.formData();
    name = String(form.get("name") ?? "").trim();
    phone = String(form.get("phone") ?? "").trim();
  } catch {
    return gateForm("That submission did not come through. Try again.");
  }

  const normalized = normalizeE164(phone);
  if (!name || name.length > 80 || !normalized) {
    return gateForm("Add the name you want on the card, and the number in full international form.");
  }

  const pepper = env.SESSION_SECRET;
  const phoneHash = hashPhone(normalized, pepper);

  // Authorise before writing anything. `removed` is not an invite.
  const invited = await db.prisma.allowlistEntry.findUnique({
    where: { circleId_phoneE164Hash: { circleId: circle.id, phoneE164Hash: phoneHash } },
    select: { id: true, status: true },
  });
  if (!invited || invited.status === "removed") {
    // One message for every kind of no, so this form cannot be used to walk a phone list.
    return gateForm("We could not let you in with that number.");
  }

  const session = await db.prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { phoneE164: normalized },
      create: { phoneE164: normalized, displayName: name },
      update: { displayName: name },
    });

    await tx.membership.upsert({
      where: { circleId_userId: { circleId: circle.id, userId: user.id } },
      create: { circleId: circle.id, userId: user.id, role: "friend", status: "active" },
      update: { status: "active" },
    });

    if (invited.status === "pending") {
      await tx.allowlistEntry.update({ where: { id: invited.id }, data: { status: "accepted" } });
    }

    return issueSession({ userId: user.id, circleId: circle.id, role: "friend" });
  });

  const expiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  // 303, not 302: a redirect after a POST must become a GET, or a refresh re-submits the form.
  return new Response(null, {
    status: 303,
    headers: headers({ Location: `/c/${encodeURIComponent(slug)}`, "Set-Cookie": sessionCookie(session, expiry) }),
  });
}
