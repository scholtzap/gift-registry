---
title: "RN-F — promoting a proxy circle when the recipient later joins"
type: spec
status: out-of-window
priority: P3
rank: 19
updated: 2026-10-31
apps: []
related: [docs/plans/rn-tracks.md, docs/plans/rn-a-proxy-registry-spec.md, docs/plans/rn-c-proxy-circle.md, docs/plans/rn-b-lookup-route.md]
evidence: src/server/wa/identity.ts:4-11 (MembershipContext.ownerUserId typed non-null; selectActiveActor returns null unless exactly one active membership), src/server/auth/session.ts:95-108, src/server/routes/circle.ts:397-451, docs/plans/rn-a-proxy-registry-spec.md
archived_date: null
supersedes: null
superseded_by: null
---

# RN-F — claim / promote a proxy circle

**Status:** Out of window (owner, 2026-10-31: no OTP in the submission demo). Post-submission track. It stays
**externally** gated as well: promotion needs an OTP *authentication* template, which Meta charges for per message
and takes up to 24h to approve, so request the approval only when this track is scheduled, not before.

## Problem

A proxy circle is created by a gifter for a person with no account (RN-A, RN-C). Sooner or later that person finds out
and signs up. At that moment three things must happen at once and none of them happens today:

1. The circle gains an owner, so `owner_user_id` goes from NULL to a real user.
2. The gifter who created it must **stay** a plain `friend` — RN-A's decision. They must not lose claim/pool paths and
   the owner-blindness guarantee must not flip on them mid-event.
3. The recipient's own view of the ledger must not become an owner view that shows what is claimed — because the whole
   product rule is that an owner never sees claims. Promotion therefore cannot be "set the owner and render the owner
   projection"; it needs an explicit answer about what the new owner sees for a circle that already has claims.

## What this track decides

**Identity at promotion.** The recipient proves possession of the number whose HMAC digest is already stored on the
proxy circle. The digest is the claim token; it is compared constant-time exactly as the allowlist is today
(`src/server/auth/phone-hash.ts`). Do not invent a second secret and do not email/link a code.

**The type system already disagrees with a NULL owner.** `MembershipContext.circle.ownerUserId` is declared `string`,
not `string | null` (`src/server/wa/identity.ts:4`), and `selectActiveActor` derives the role by comparing that field
to the caller (`:9`). Any code path that reads a proxy circle through this type will either crash on the boundary or
silently mis-role someone. The track must enumerate the places that assume an owner exists, not just fix one.

**Ambiguity rule.** `selectActiveActor` returns `null` unless the user has exactly one active membership in exactly one
active circle (`:7`). A person who promotes a proxy circle while already in a real circle now has two and the bot stops
resolving them. Decide explicitly: does promotion set an *active circle* selection, does the bot get a "pick which
circle" flow, or does the bot keep replying `FIXED_MENU` and the web session is the only place with two circles? The
last option is the honest default and must be stated as a known limitation, not a bug.

**Slug continuity.** Unsettled in RN-A: does a promoted circle keep the `/c/<slug>` people already pasted into
WhatsApp? Recommendation: **keep it** — `/c/<slug>` never moves is a non-negotiable rule in `AGENTS.md` and a link in
a group chat is the only distribution channel. Record the counter-argument: a slug minted for a private proxy circle
becomes a permanent public handle for a real person.

**What the new owner sees.** Give the promoted owner the friend projection until they explicitly take over, or give
them an owner view that is blank on claims. Pick one. Either way there must be no code path in which promoting makes
claims, pools or deal suggestions visible to an owner — that is the product rule, not a preference.

## Handover brief for the implementation agent

**Read:** `src/server/wa/identity.ts`; `src/server/auth/phone-hash.ts`; `src/server/auth/session.ts`; the session
mint in `src/server/routes/circle.ts:397-451`; `src/server/db/` policies including `002_policies.sql`; every place
`ownerUserId` is read (`grep -rn ownerUserId src`); `src/server/agent/tasks.ts` for `FIXED_MENU`;
`docs/plans/rn-a-proxy-registry-spec.md` and `docs/plans/rn-c-proxy-circle.md`.

**Definition of done:** a promotion route that (a) requires an OTP proof bound to the stored digest, (b) flips
`owner_user_id` from NULL to the proven user atomically with a membership write, (c) is idempotent — a second attempt
by the same number is a no-op not a duplicate owner, (d) is refused for anyone who is not that number, and a test
proving a stranger with the link cannot promote. Plus: `MembershipContext` updated so a NULL owner is representable
without a runtime surprise; the multi-membership answer stated in code and in a test; the leak suite green; a test
that the rendered owner HTML after promotion shows no claim/pool detail.

**Fail criteria — stop and report:** if the OTP authentication template is not approved (this cannot be built live
without it); if promotion requires moving `/c/<slug>`; if making the NULL owner representable requires editing the
countdown files in flight in the main checkout.

**Do not touch:** `src/server/views/`, `src/lib/dates.ts`, `tests/leak/`, `prisma/migrations/20261027150000*` — the
countdown build owns that surface. One file per agent; do not run `refresh_plans_index.py` (the orchestrator does).

## Out of scope

Any change to what a *normal* owner sees. Migrating a proxy circle's ledger. Deleting a proxy circle. Billing.

## External gate — OTP template cannot be created yet (verified 2026-10-27)

The owner registered a WhatsApp Business account (WABA `1125407990451257`, Scholtz.Work) and
attempted to create the `gift_circles_otp` authentication template in WhatsApp Manager. Meta
refused at creation: *"This WhatsApp Business account does not have permission to create
message template."* That exact string is Meta's authentication-category rejection, not a
UI-assignment error: since mid-September 2025, creating AUTHENTICATION templates requires
(1) completed Meta **Business Verification** and (2) a sustained messaging history at the
2,000-conversation tier (reported as at least 30 consecutive days of high-quality sending;
provider notices: Wati product update 2025-09, GREEN-API authentication-template FAQ). A
WABA created today meets neither, and the 30-day history cannot exist before the
2026-11-04 submission deadline even if verification starts immediately.

**Consequence, per this track's fail criteria — STOP, do not build a fake:** RN-F does not
ship in the submission window. The demo loop already excludes OTP
(`docs/plans/demo-video-validation.md`). Discriminating check still owed by the owner: a
UTILITY template should submit fine on the same account; if it also fails, the asset
assignment (Full control on the WABA) needs fixing first. Post-submission path: complete
Business Verification now, build legitimate message history, then create the template and
build this track. The promotion design in this file is unchanged and waits.

## Blocks / gated by

Blocks RN-G (the bot cannot offer a find-a-friend task that has no promotion path). Gated by RN-C for the proxy
schema, and externally by the Meta OTP template approval.
