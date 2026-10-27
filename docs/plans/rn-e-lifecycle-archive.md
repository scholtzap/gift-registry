---
title: "RN-E — circle lifecycle: a once-off registry that archives itself after the day"
type: spec
status: draft
priority: P3
rank: 18
updated: 2026-10-27
apps: []
related: [docs/plans/rn-tracks.md, docs/plans/rn-a-proxy-registry-spec.md, docs/plans/birthday-and-event-countdown.md]
evidence: prisma/schema.prisma (CircleStatus has active and closed only), src/lib/dates.ts, docs/plans/birthday-and-event-countdown.md, sharewear lib/models/loan_graph.dart:4-40 (derived expiry precedent)
archived_date: null
supersedes: null
superseded_by: null
---

# RN-E — lifecycle and archive

**Status:** Draft. Independent of every other track — schema and policy only. Cheapest thing to take off the plate now.

## Problem

The product decision is that a proxy registry is **once-off**: it exists to buy one gift for one day, then it should
stop being findable and stop taking money. Three things in the current code make that non-trivial:

1. `CircleStatus` in `prisma/schema.prisma` has `active` and `closed`. There is no `archived`, so there is no state
   that means "this served its purpose" as distinct from "the owner shut it".
2. Nothing in this repo schedules anything. There is no cron, no scheduled workflow, no job table, no revalidation
   hook that advances a status. Verify with a search before assuming otherwise.
3. The date an archive would key off is one of the two dates in `docs/plans/birthday-and-event-countdown.md`, and
   **the event date can be secret when a friend wrote it**. A transition that reads that date must not surface it
   into the owner projection — RLS filters rows, not columns, so `ownerCircleView` is the guard.

## What this track decides

| From | To | Trigger | Changes | Preserved |
|------|----|---------|---------|-----------|
| `active` | `archived` | the event date plus a grace window has passed | disappears from search, rejects new claims and pledges | ledger, money state, memberships, card |
| `archived` | `purged` (rows deleted) | a retention horizon, if RN-D asks for one | hashed allowlist rows and the proxy lookup key | nothing |

Specify the grace window and the retention horizon as numbers, not prose.

**Trigger mechanism — pick one and defend it.** The candidate that needs no new infrastructure is a **lazy
on-read transition**: derive the state from the stored date at read time, and write it opportunistically. It does
not depend on a scheduler being alive during the demo recording, which matters because the app runs in Docker on an
Oracle VM behind Caddy and a missed job during the video is a visible failure. The counter-argument to document:
a derived state cannot be indexed, so a lookup that filters on status needs the same derivation in SQL.
If instead a real job is chosen, say where it runs and what happens when it does not.

**Do not copy the whole shape found in sharewear, but do copy half of it.**
`C:\Users\apsch\Documents\personal\sharewear\lib\models\loan_graph.dart` is the precedent worth taking: a pending
request expires at the **earlier of** `createdAt + 72h` and the end of the day that matters, computed from stored
dates (`acceptDeadline`, :27-40), and "who must act next" is an enum **derived from the request, not a second stored
state** (`LoanActor { owner, borrower, nobody }`, :4-17). That is exactly the lazy on-read transition recommended
above, proven in the owner's own app, and it needs no scheduler. The half not to copy: `expirePendingIfDue`
(`lib/services/firestore_service.dart:1561`) is invoked only from `lib/screens/owner_dashboard_screen.dart:43`, so the
*write* happens when somebody opens the app. In a Flutter client with an owner staring at a dashboard that works. Here
the archived flag has to be authoritative for a lookup route that a stranger may hit when nobody has the app open, so
derive on read and treat any stored status as a cache, never as the truth.

## Handover brief for the implementation agent

**Read:** `prisma/schema.prisma`; `src/lib/dates.ts`; `docs/plans/birthday-and-event-countdown.md`;
`src/server/routes/circle.ts`; every policy file under `src/server/db/`; `package.json`, `docker-compose.yml`,
Dockerfiles and `.github/workflows/` — to confirm what scheduling exists; `scripts/ops/` for the ops-script pattern.

**Definition of done:** an expand-only migration adding the state (never a destructive change to `CircleStatus`);
the transition rule stated in one place and used by both the lookup route and the circle route; a test that an
archived circle is not findable, still readable to members, and refuses a new claim; a test that the transition
cannot leak a friend-set event date into the rendered owner HTML; the leak suite still green.

**Fail criteria — stop and report:** if the migration would rewrite an existing enum value in place, or if making
the change requires editing the countdown files that are being built in the main checkout right now.

**Do not touch:** `src/server/views/`, `src/lib/dates.ts`, `tests/leak/`, `prisma/migrations/20261027150000*` —
another agent owns the countdown surface.

## Success criteria

- A circle created today for a day next week is `active` now and not findable after the grace window, with no human
  intervention and no scheduler running.
- Nothing about the money or the ledger is destroyed by archiving.
- The owner projection renders byte-identically before and after the transition for a friend-set date.

## Out of scope

Deleting a circle. Any hard purge of the ledger. Stripe-adjacent money state. Re-opening an archived circle.

## Open questions

Does a *normal* (owner-run) circle archive too, or only proxy circles? Does RN-D's retention answer change the
grace window? Is an archived circle still reachable at its exact `/c/<slug>` URL for the people who already have it?

## Blocks / gated by

Blocks RN-C (a proxy circle needs a terminal state before it can be created at scale). Gated by RN-D for retention.
