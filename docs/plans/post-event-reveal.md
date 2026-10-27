---
title: Post-event reveal of secret suggestions (F14)
type: spec
status: implementing
priority: P2
rank: 7
updated: 2026-10-27
apps: []
related: [SPEC.md, docs/plans/gift-circles-ten-day-build-plan.md]
evidence: SPEC.md §Decisions v1.1 (post-event reveal), §User flows F14
archived_date: null
supersedes: null
superseded_by: null
---

# Post-event reveal (F14)

**Built 2026-10-27** on `feat/day-3-followups` (see `day-3-nine-followups.md` #9):
`revealItem` in `src/server/ledger/index.ts` (friend-only, `zoneDay`-gated, author veto,
one guarded `updateMany`), `canReveal` on the friend projection, reveal form on the item
screen, route intent `reveal`. Provisional early unlock below remains **unbuilt** and is
still first cut. Ledger tests pin before/after the day, the veto, owner refusal, and the
owner projection gaining the item only after reveal.

**Status:** Date gate, author veto and attribution **decided**. Unanimous early unlock **provisional** — first thing
cut at the day-7 gate.

## Problem

Secret suggestions are invisible to the owner forever, which is the point until the event is over. After that,
"look what we almost got you" is a real beat the product currently drops on the floor.

## Success criteria

- After `circles.event_date` has passed, any friend in the circle can reveal a secret suggestion; before that date the
  button does not render and the route **404s**.
- An item the author flagged `reveal_ok = false` is never revealed, by anyone, at any time.
- A reveal writes `revealed_at` + `revealed_by_user_id` on the item and a ledger event, and the owner projection shows
  who revealed it.
- **No notification is sent** — the reveal stays a human act (`AGENTS.md`).
- Reveal covers secret **suggestions** only. Claims, pools and contributor amounts never enter the owner projection,
  and no flag or date gate can turn that on.
- The owner cannot trigger a reveal, so they cannot fish.

## Build shape

- Expand-only migration: `items.reveal_ok Boolean @default(true)`, `items.revealed_at`, `items.revealed_by_user_id`.
- Guarded transition, one statement:
  `UPDATE items SET status='revealed', … WHERE id=$1 AND status='active' AND visibility='friend_only' AND reveal_ok`.
  Zero rows affected renders the **same 404** as "not yours", so the response cannot be used to probe.
- `items_owner_read` already admits `status = 'revealed'` — the RLS spine needs no change. The gate is the date, the
  veto and the transition.
- Leak-suite rows: revealed item invisible to the owner before the gate; visible after; `reveal_ok = false` never
  visible; a direct `status` write in a test is a false success and does not count.
- Author-facing copy at add time: "Nadia will see this after 5 Dec" / "Nadia will never see this".

## Provisional: early unlock

Any friend may request it; every **active** friend membership must approve; approvals are unique per
`(request, user)` and counted at read time so a member who left cannot block it permanently.

## Out of scope

Revealing money state. Undoing a reveal silently (a mistaken reveal is a ledger-visible admin action, not an
un-write). Notifying the author when someone else reveals their note beyond the in-app attribution.

## Cut line

Early unlock is cut without discussion at the day-7 gate. If the reveal itself does not land by day 8, it goes
entirely — the date gate is a convenience over a product that already works without it.
