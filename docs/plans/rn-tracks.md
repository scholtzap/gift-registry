---
title: Registry-network tracks — order, dependencies and what can run in parallel
type: plan
status: ready
priority: P1
rank: 12
updated: 2026-10-31
apps: []
related: [docs/plans/registry-network-discovery-deviations.md, docs/diagrams/pinata-customer-journey.drawio, docs/diagrams/pinata-discovery-access.drawio, docs/diagrams/pinata-registry-network-buildmap.drawio]
evidence: docs/plans/registry-network-discovery-deviations.md (the nine deviations this queue closes)
archived_date: null
supersedes: null
superseded_by: null
---

# Registry-network tracks

**Status:** Ready. This is the index for ten tracks. Read this first, then the track you are assigned.
Rewritten 2026-10-31: five tracks have landed, so this file now says what is left rather than what was queued.

## What is being built

A gifter searches a phone number. Under the owner's wave-0 decision the route is **create-only inside
this window**: a lookup always offers a once-off **proxy registry** for someone with no account and never
renders an existing circle. The recipient never signs up, is never notified, and no name or number is
stored for them. The circle archives some time after the day. The found branch returns only with
`registry_profiles` plus a visibility field, which is post-submission work.

## State as of 2026-10-31

rn-a, rn-d and rn-e are `ready`. **rn-b (create-only lookup, CSPRNG slug, `trustedClientAddress`), rn-c
(nullable owner plus the NULL-owner RLS fix and leak test), rn-d's pepper split, rn-e (lazy `archived`
derivation) and rn-j (permission requests) have landed on main** with tests in `tests/routes/` -
`lookup.test.ts`, `slug-and-address.test.ts`, `phone-pepper.test.ts`, `lifecycle.test.ts`,
`permission-request.test.ts`. So the queue below is what is *left*, not what was planned.

| Track | Status in window | What remains |
|-------|--------------------|--------------|
| rn-b, rn-c, rn-e, rn-j | landed on main | harden against the gates below, then show it in the video |
| rn-a, rn-d, rn-e specs | ready | nothing - they are the authority the code cites |
| **rn-g** | **recommended not built** | under create-only a bot search can only mean *create by number*, which is the cheapest squatting channel and needs the throttle mounted first; the web lookup is the search surface in the video |
| **rn-f** | out-of-window | owner descoped OTP from the demo (2026-10-31); promotion is post-submission, and so is the authentication-template approval |
| **rn-h** | out-of-window | `noindex` stays load-bearing; on-platform search is a query, not an index |
| ledger | open | rows 1 (per-person `/r/<handle>`), 2 (visibility field) and 11 (owner session) are still unbuilt |

**Open gates that block shipping the lookup to a judge:** the throttle is mounted on the route but the
`TRUSTED_PROXY` contract defaults off, so the localhost demo is unthrottled-by-flag - fine for recording,
and it must be explicitly enabled on the VM before any public link goes out. G1 (create-only) is answered
yes by rn-i.

**Critical path now:** rn-b -> rn-c -> rn-j -> the demo. rn-f and rn-g are off it.

## Sequencing for what is left

1. Prove the always-200 invariant with a test that a registered and an unregistered lookup body are
   indistinguishable apart from branch content, and that no raw digits reach a URL, body or log.
2. Close ledger row 11 - there is still **no owner session**, which is what makes the visibility switch and
   the rn-j inbox reachable by the person who owns the circle.
3. Record on the ledger that the found branch is deferred, so nobody reads create-only as a limitation of
   the schema rather than a decision.

## Two things that are not on this queue

- Meta friend-graph import stays impossible (`/me/friends` needs `user_friends` and returns only people already using
  the app; a BSUID cannot be reverse-resolved). The substitute is `REQUEST_CONTACT_INFO`, tracked in rn-i.
- The two-dates countdown work in `birthday-and-event-countdown.md` is a different build and is already in flight.
  None of these tracks may touch those files.

## How to start a track

Open the track file. It carries its own handover brief: the evidence to read with file:line, the decisions it must
make, definition of done, fail criteria, and a do-not-touch list. Planning tracks end in a written spec and a
`refresh_plans_index.py --write`. Implementation tracks do not start until their blocking spec is `status: ready`.
