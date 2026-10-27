---
title: RN-A - proxy registry data model and authority rules
type: spec
status: draft
priority: P1
rank: 14
updated: 2026-10-27
apps: []
related: [SPEC.md, AGENTS.md, docs/plans/rn-tracks.md, docs/plans/registry-network-discovery-deviations.md, docs/plans/birthday-and-event-countdown.md, docs/plans/rn-i-submission-window-triage.md]
evidence: 'prisma/schema.prisma:197-248,28-42,368; src/server/auth/phone-hash.ts:3-32; src/server/routes/circle.ts:43-48,151-152,254-262,397-451; src/server/auth/session.ts:52-62,95-108; src/server/wa/identity.ts:5-28; src/server/agent/tasks.ts:5,17-46; src/server/ledger/index.ts:4-12,43-44,249-257; src/server/db/policies/001_roles.sql:34,50-63; src/server/db/policies/002_policies.sql:24-35,51-68,157-167,181-199,312-318,344-349; SPEC.md:730-739'
archived_date: null
supersedes: null
superseded_by: null
---

# RN-A - proxy registry data model and authority rules

**Status:** Draft. Decides schema, authority and secrecy for a circle created *for* a person who has no account. The
feature is decided (owner, 2026-10-27); this file only decides how it is modelled. It is the data model deviation
rows 1-2 (`docs/plans/registry-network-discovery-deviations.md:37-38`) assume and the proxy branch of row 3 closes.

## This reverses a recorded decision - stated plainly

`SPEC.md:735-737` defers *"Public discovery of strangers by phone number ... because public lookup is a scraping
surface we don't need for a gated-circle demo."* That judgement was correct for a gated-circle demo and this is not
one. The scraping surface is real and is why D6 exists; the `/gifts.scholtz.work/<phone>` form was rejected because a
number in a path leaks into history, server logs, proxies, referrers and link previews. What changed is not the risk
but the value side: a gifter with no allow-listed circle has no path at all (row 3, `:39`).

## Decisions

**D1 - Owner-blindness becomes structural, not a projection rule.** There is no owner account, so no projection to
guard. Rejected: making the creator gifter the owner - `app_actor_joined_circle` excludes the actual owner
(`002_policies.sql:29-35`), so an owner-self cannot claim or pool (`claimItem` requires role `friend`,
`src/server/ledger/index.ts:43-44`), and `MembershipRole` only has `owner|friend` (`prisma/schema.prisma:39-42`), so
a third value is a schema change to buy nothing. With `owner_user_id` NULL, `circles_owner_read` and
`items_owner_read` (`002_policies.sql:157-167,207-213`) yield zero rows and `ownerCircleView` returns null
(`src/server/views/index.ts:64-75`), which `circle.ts:233` already renders as 404 - never 403 (`circle.ts:32-34`). **The load-bearing gotcha:** `ci.owner_user_id <> app_user_id()` is NULL, not TRUE, when the owner
is NULL, so every friend policy silently fails closed on a proxy circle. `app_actor_joined_circle` must become
`(ci.owner_user_id IS NULL OR ci.owner_user_id <> app_user_id())` and a leak test must prove both halves.
**Creator gifter rights, and only these:** an immediate `friend` membership with no allowlist row; sole write of
`recipient_label` and `occasion` at creation; nothing else - no removal rights, no archive (RN-E), no read the other
friends lack. The ledger needs no new shape: `ledger_events.actor_user_id` is already nullable
(`prisma/schema.prisma:368`) and every proxy write has a real friend actor, so `append()`
(`src/server/ledger/index.ts:36-41`) is unchanged.

**D2 - A proxy circle is a `Circle` row with `owner_user_id` made nullable. Not a new table, not a discriminator.**
Every money and intake table hangs off `circles.id` (`items.circleId` `prisma/schema.prisma:252`,
`ingest_events.circleId:343`, `ledger_events.circleId:365`; claims, pools, contributions and cards reach it through
items), so a `proxy_circles` table duplicates that subgraph or forces a union in every join; and `/c/<slug>` already
resolves by `shareSlug` alone (`src/server/routes/circle.ts:171,294`), so a proxy circle needs no new route. A `kind`
enum is rejected because it restates `owner_user_id IS NULL` and so permits a row that says `proxy` and has an owner.
Delta, all expand-only (`ARCHITECTURE.md:141`): `owner_user_id` nullable - the owner `Cascade` at
`prisma/schema.prisma:207` simply stops applying, since there is no owner row to delete from - plus
`recipient_label text`, `recipient_phone_e164_hash text`, `proxy_created_by_user_id uuid`. `CircleStatus` stays
`active|closed` (`prisma/schema.prisma:28-31`) - an `archived` value belongs to RN-E. Creation cannot reuse
`createCircle`, which is blocked today for lack of an `app_owned` memberships INSERT
(`src/server/ledger/index.ts:249-257`, comment at :255), so it writes on the login role the way the gate already does
(`src/server/routes/circle.ts:425-443`, "authorise before writing" at :38-40), and the seed proves the path
(`scripts/seed.ts:48`).

**D3 - The recipient's number is a lookup key, never plaintext on a proxy circle.** The primitive exists: `hashPhone`
is HMAC-SHA256 over `normalizeE164` with a pepper (`src/server/auth/phone-hash.ts:3-17`), the production pepper is
`env.SESSION_SECRET` (`src/server/routes/circle.ts:412-413`), and the digest is already validated as
`/^[a-f0-9]{64}$/` (`src/server/ledger/index.ts:252`). Store that digest on `circles` and seed one `allowlist_entries`
row (`prisma/schema.prisma:218-232`, unique on `(circleId, phoneE164Hash)`) so D4 has something to flip. Rejected: a
`users` row for the recipient - `users.phone_e164` is plaintext by design because the send path needs it
(`001_roles.sql:50-53`) and is `@unique` (`prisma/schema.prisma:136`), and a phantom person would surface in
`app_actor_in_circle_roster` (`002_policies.sql:60-68`) as a member. **Honest limit:** `normalizeE164` accepts 9-15
digits (`phone-hash.ts:30`), so a SA mobile hash is one of roughly 10^8 candidates - this defends a leaked *table*,
not a targeted offline crack, and rests entirely on the pepper staying out of the DB. Caps are RN-D's.

**D4 - Claimable, but the claim is just the existing gate; conversion is a separate explicit act.** No new code path:
the recipient given the link submits name + number, `hashPhone` matches their `allowlist_entries` row, `pending`
becomes `accepted` (`src/server/routes/circle.ts:416-422,438-440`), the user is upserted with their own `phone_e164`,
and a `friend` membership plus a signed `SameSite=Lax` cookie issue (`src/server/auth/session.ts:52-62,95-108`, TTL
:23). Promotion to owner is **not** automatic on a gate pass, because an allowlist match is not possession proof
(`ARCHITECTURE.md:147`) - sharewear conflates the two. What merges on promotion (`owner_user_id` NULL to the claimer,
`recipient_phone_e164_hash` cleared, one POST behind `isSameOrigin` at `src/server/routes/circle.ts:254-262`, written
on the login role): `attributes` become reachable, because they key on `userId` and resolve for the gift target
through `app_circle_of_gift_target` (`002_policies.sql:51-53`), which returns nothing while the owner is NULL. Nothing
else merges - memberships, claims, pools, contributions and ledger rows never referenced the owner.

**D5 - Event-date secrecy collapses to nothing, and the birthday must not exist.** Secrecy in
`docs/plans/birthday-and-event-countdown.md:47-51` is a function of *who wrote* the date and the owner projection
renders it only when the writer is the owner; with no owner there is no subject. Any friend may write it,
`event_date_set_by_user_id` is still recorded, and only the friend projection ever renders it (countdown `:91`). Two
rules follow. (a) The countdown backfill `event_date_set_by_user_id = owner_user_id` (countdown `:74-76`) needs
`WHERE owner_user_id IS NOT NULL` or it stamps phantom writers. (b) A proxy circle never holds
`birth_month/birth_day/birth_year`: a gifter who found a number is not the person, and a guessed date of birth for
someone who never consented is the case the countdown spec already refuses even for consenting owners (year optional,
`:41-44`). Hiding the date from the assigned buyer was rejected - they must buy on time and no `PoolStatus` value
supports waiting (`prisma/schema.prisma:77-82`).

**D6 - A proxy circle never appears as a search result; it is indistinguishable from "no registry".** The lookup
answers one of exactly two bodies, both `private, no-store` + `noindex`
(`src/server/routes/circle.ts:43-48`), and "found a proxy" is not one of them: a number with only a pending proxy
circle gets the same bytes as a number with nothing. That is what keeps `checkGateThrottle`
(`src/server/auth/throttle.ts:10`) honest while it is still unmounted in production
(`registry-network-discovery-deviations.md:72-73`, `ARCHITECTURE.md:154`); its key must be trusted-address plus the
number hash, never raw identity (`throttle.ts:7-8`). Split money - two gifters, two circles - is the accepted cost,
stated plainly; the mitigation is that `create` is idempotent **only** for a caller already holding a session scoped
to that circle (`proxy_created_by_user_id` plus `sessionFromRequest`, `src/server/auth/session.ts:115-125`), which is
the group, not the internet. Slugs are unguessable (`prisma/schema.prisma:203`) and `/c/<slug>` never moves;
crawlability stays reversed (deviation row 6, `registry-network-discovery-deviations.md:42`) and is RN-H's. On the
bot: "find someone" is not one of the six literal intents (`src/server/agent/tasks.ts:17-26`), unparseable input
returns the fixed menu (`:39-46`), and `resolveSender` needs an active membership
(`src/server/wa/identity.ts:14-20`) - so a recipient with no account is unreachable by the bot, which is the point.
No claim here depends on a Meta contact graph: BSUIDs are not reverse-resolvable and `/me/friends` is not importable
(`AGENTS.md` Verified platform constraints).

## Prior art checked: sharewear (Flutter + Firebase, same owner)

Pattern: a collection is created with plaintext `invitedEmails` and `members: [ownerId]` (`sharewear/lib/services/firestore_service.dart:40-51`); at session prep the client queries `where('invitedEmails', arrayContains: email)` and self-writes `members: arrayUnion([uid])` plus `arrayRemove` of its own email (`:57-79`), called from `sharewear/lib/main.dart:318-327` and `sharewear/lib/screens/home_screen.dart:44-59`; rules confine that write to `onlyChanges(['members','invitedEmails'])` and `members.size() == old + 1` (`sharewear/firestore.rules:135-142`), with `allow list: if false` on profiles (`:334-335`).
**Transfers:** the invitee proving the address the invite named, as the join credential; the one-way
`pending -> accepted` flip; field-whitelisted self-update; never-list-only-get-by-known-id. All four already have
analogues here (`AllowlistStatus` `prisma/schema.prisma:33-37`, `src/server/routes/circle.ts:438-440`, 404-not-403).
**Does not transfer:** (i) plaintext identity in a denormalised array as the key - Postgres arrays are not row-scoped,
so a hash array on `circles` rides every circle read, whereas `allowlist_entries` scopes per row
(`002_policies.sql:344-349`); (ii) client-driven claim on app open - there is no app and `selectActiveActor` returns
null for more than one active circle (`src/server/wa/identity.ts:5-11`), so no cross-circle invite sweep exists;
(iii) a not-yet-member inserting its own membership - `memberships_self_join` is unreachable on a first join because
INSERT is filtered by the SELECT half (`002_policies.sql:181-199`), so the write goes on the login role as the gate does.

## Success criteria

1. Two leak tests on the `app_actor_joined_circle` NULL branch: a friend session on a proxy circle reads its items, an owner-role session on it renders 404 - asserted on the response body.
2. A proxy circle renders no owner surface and no `attributes`; `recipient_label` is the only recipient text.
3. No column and no committed file holds an E.164 - the recipient number exists only as a 64-hex digest, and `git grep -nE '\+27[0-9]{8,9}'` stays clean.
4. The lookup response for "proxy exists" is byte-identical to "nothing exists", asserted in a route test.
5. A recipient gate-pass yields a `friend` membership and a session and changes no `owner_user_id`; promotion is a second, separate, origin-checked POST.
6. Migration is expand-only; the previous image tag still runs against it.
7. `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm leak` and the Playwright flows stay green with no assertion weakened, and `/c/nadia-30th` still resolves.

## Out of scope

Throttle values and per-IP/per-account caps (RN-D). Archive, expiry, the `closed` transition (RN-E). The lookup route
and its response bodies (RN-B). The create UI and its form (RN-C). Bot additions (RN-G). Lifting `noindex` (RN-H).
OTP as a door - gated on the template approval RN-F carries. Any Meta contact import. Money holding.

## Open questions

- Should `recipient_phone_e164_hash` use a pepper distinct from `env.SESSION_SECRET`? Reusing it is what makes gate
  and lookup agree (`src/server/routes/circle.ts:412-413`); splitting them is a key-management decision RN-D should
  own, not this file.
- Is `occasion`, free text the creator writes, safe to show every friend when it can spoil the gift the way a date
  can? Left open deliberately; it does not block RN-C.
- Does a promoted circle keep its `shareSlug`? Assumed yes (`/c/<slug>` never moves), but RN-F should state it rather
  inherit the assumption.

## Blocks / gated by

**Blocks:** RN-B and RN-C cannot start until this is `status: ready`; RN-C also waits on RN-E for the closure shape.
**Gated by:** `docs/plans/rn-i-submission-window-triage.md` - if the owner answers no to its question 1, RN-B, RN-F and
RN-G fall out of the window and this stays a post-submission document.
**Not touched:** the date rendering in `src/server/views/index.ts` and anything owned by
`docs/plans/birthday-and-event-countdown.md` (`docs/plans/rn-tracks.md:44-49`); the only shared column is
`event_date`, and making it nullable is already that spec's change to make.
