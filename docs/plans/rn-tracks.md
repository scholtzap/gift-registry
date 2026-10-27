---
title: Registry-network tracks — order, dependencies and what can run in parallel
type: plan
status: ready
priority: P1
rank: 12
updated: 2026-10-27
apps: []
related: [docs/plans/registry-network-discovery-deviations.md, docs/diagrams/pinata-customer-journey.drawio, docs/diagrams/pinata-discovery-access.drawio, docs/diagrams/pinata-registry-network-buildmap.drawio]
evidence: docs/plans/registry-network-discovery-deviations.md (the nine deviations this queue closes)
archived_date: null
supersedes: null
superseded_by: null
---

# Registry-network tracks

**Status:** Ready. This is the index for ten tracks. Read this first, then the track you are assigned.

## What is being built

A gifter searches a phone number. If it resolves, they see that person's registry. If it does not, they create a
once-off **proxy registry** for someone who has no account, and share one link into the group. The recipient never
signs up. The circle archives some time after the day.

## The order

| # | Track | Type | Starts when | Blocks | Can run in parallel with |
|---|-------|------|-------------|--------|--------------------------|
| 1 | `rn-i-submission-window-triage.md` | owner decision | now, ~10 min | nothing blocks on it, but it decides the scope of 6–10 | 1, 2, 3, 4 |
| 2 | `rn-a-proxy-registry-spec.md` | planning (`/interview`) | now | 5, 6, 7, 9 | 3, 4, 11 |
| 3 | `rn-d-abuse-model.md` | planning | now | 5, 7 | 2, 4, 11 |
| 4 | `rn-e-lifecycle-archive.md` | planning | now — schema only, no dependency | 6 | 2, 3, 11 |
| 5 | `rn-b-lookup-route.md` | implementation | 2 and 3 are signed off | 8, 9 | 6, 7 |
| 6 | `rn-c-proxy-circle.md` | implementation | 2 and 4 are signed off | 9 | 5, 7 |
| 7 | `rn-j-permission-request.md` | implementation | 2 and 3 are signed off | 10 | 5, 6, 8 |
| 8 | `rn-f-claim-merge.md` | implementation | 5 exists; externally gated on the OTP template approval | 9, 10 | 7 |
| 9 | `rn-g-bot-find-task.md` | implementation | 5, 6 and 8 exist | — | — |
| 10 | `rn-h-crawlability.md` | policy decision | recommend **defer to after 2026-11-04** | — | — |
| 11 | `registry-network-discovery-deviations.md` | spec (ledger) | already open | — | — |

**Critical path:** rn-a → rn-b → rn-f → rn-g. rn-e, rn-d and rn-j are the parallel branches — rn-j touches the gate
route and the allowlist table, not the circle table, so it collides with nothing on the path. Take rn-d and rn-e off
the plate early; they are the cheapest and both gate other tracks.

## Two things that are not on this queue

- Meta friend-graph import stays impossible (`/me/friends` needs `user_friends` and returns only people already using
  the app; a BSUID cannot be reverse-resolved). The substitute is `REQUEST_CONTACT_INFO`, tracked in rn-i.
- The two-dates countdown work in `birthday-and-event-countdown.md` is a different build and is already in flight.
  None of these tracks may touch those files.

## How to start a track

Open the track file. It carries its own handover brief: the evidence to read with file:line, the decisions it must
make, definition of done, fail criteria, and a do-not-touch list. Planning tracks end in a written spec and a
`refresh_plans_index.py --write`. Implementation tracks do not start until their blocking spec is `status: ready`.
