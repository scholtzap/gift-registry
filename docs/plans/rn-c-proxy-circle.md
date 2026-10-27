---
title: "RN-C — proxy circle creation, its share link, and the RLS that breaks without it"
type: spec
status: backlog
priority: P2
rank: 17
updated: 2026-10-27
apps: []
related: [docs/plans/rn-tracks.md, docs/plans/rn-a-proxy-registry-spec.md, docs/plans/rn-e-lifecycle-archive.md, docs/diagrams/pinata-discovery-access.drawio]
evidence: src/server/db/policies/002_policies.sql, prisma/schema.prisma, src/server/routes/circle.ts
archived_date: null
supersedes: null
superseded_by: null
---

# RN-C — proxy circle creation

**Status:** Backlog. Implementation track. Gated by RN-A and RN-E.

## Problem

Creating a circle for someone with no account is not a copy-paste of creating one for an owner. RN-A found the
load-bearing blocker, and it is the reason this track exists as its own unit rather than a line item in RN-B:

> The friend-facing policy in `src/server/db/policies/002_policies.sql` compares `ci.owner_user_id <> app_user_id()`.
> On a proxy circle `owner_user_id` is **NULL**, and in Postgres `NULL <> x` is `NULL`, not `true`. Every friend
> policy therefore fails closed and the circle renders empty.

Verify that in the policy file before changing anything, and check every other policy that touches `owner_user_id`
for the same three-valued-logic trap. The fix is small and it is also the kind of change that silently widens access,
so it needs its own leak test, not a passing unit test.

## What to build

1. The create path: a gifter supplies the recipient's number as a lookup key only, plus the item and the event date;
   a circle row is made with no owner user, a CSPRNG share slug, and the recipient recorded as a keyed digest and a
   `pending` allowlist entry rather than a `users` row.
2. The share link: `/c/<slug>` — the route must **not** move, and the page renders the friend projection with nobody
   in the owner seat. The link is constant for that one gift and is what gets pasted into the group or onto a status.
3. The RLS amendment, with the `IS DISTINCT FROM` form or an explicit NULL branch, plus a policy test that a random
   non-member still sees nothing.

## Handover brief

**Read:** `docs/plans/rn-a-proxy-registry-spec.md` (the data-model decisions are already made there — do not re-decide),
`src/server/db/policies/002_policies.sql` and its siblings, `prisma/schema.prisma` (`Circle`, `AllowlistEntry`,
`Membership`), `src/server/routes/circle.ts`, `tests/leak/` for how a leak proof is written in this repo,
`docs/plans/rn-e-lifecycle-archive.md` for the terminal state.

**Definition of done:** creating a proxy circle and loading its `/c/<slug>` as a joined friend renders the ledger
(not empty); the same URL as a non-member renders the gate; the owner projection for a proxy circle renders nothing
that identifies the recipient; a leak test proves the NULL-owner policy change did not open a row to strangers;
`/c/<slug>` for a *normal* circle is untouched and its existing test stays green.

**Fail criteria — stop and report:** if the policy fix requires changing a policy that the countdown build in the
main checkout is also editing, or if it cannot be expressed without making `owner_user_id` non-nullable with a
backfill (that would silently invent owners).

**Do not touch:** the countdown files and migration listed in RN-B, `src/server/views/` beyond the minimal render
hook, `AGENTS.md`.

## Success criteria

- Two friends with no account anywhere in the system can pool money behind one buyer on a proxy circle.
- The recipient's number appears in no log, no URL, no stored plaintext column.

## Out of scope

Claiming or promoting a proxy circle (RN-F). Archiving (RN-E). Any notification to the recipient — there is none,
by design, and a test should keep it that way.

## Open questions

Does the creator gifter get any elevated right, or are they a plain member (RN-A says plain member — confirm it
survives contact with the UI)? Is the creator's name shown on the proxy page so the group knows who made it?

## Implementation gate — stopped here (2026-10-27)

Specs are unblocked (RN-A and RN-E are `ready`, 2026-10-27) but implementation is stopped on the
NULL-owner audit's proof requirement: the `app_actor_joined_circle` fix
(`(ci.owner_user_id IS NULL OR ci.owner_user_id <> app_user_id())`, plus an audit of **every**
policy touching `owner_user_id` — `002_policies.sql:27,35,53,65,167` as re-verified 2026-10-27)
widens access by construction and RN-A requires it to ship **with** a leak test proving both
halves. No Postgres is reachable from the dev machine (Docker engine down, no `DATABASE_URL`),
so no leak test can run. Do not land the migration or policy change unverified, and never make
`owner_user_id` non-nullable with a backfill. Unblock: start Docker/Postgres, confirm
`pnpm leak` green on the untouched tree, then implement with the leak test in the same change.

## Blocks / gated by

Gated by RN-A, RN-E. Parallel with RN-B. Blocks RN-G.
