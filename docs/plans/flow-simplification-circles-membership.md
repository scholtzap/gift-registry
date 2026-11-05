---
title: Flow simplification — membership, lookup, friend archive, gift suggestions
type: spec
status: implemented
priority: P1
rank: 7
updated: 2026-11-05
apps: []
related:
  - docs/plans/chrome-nav-consistency.md
  - docs/plans/owner-circles-return-home.md
  - docs/plans/rn-b-lookup-route.md
  - docs/plans/rn-c-proxy-circle.md
  - docs/plans/shared-registry-and-circles.md
  - docs/diagrams/pinata-page-action-map.drawio
  - docs/diagrams/pinata-customer-journey.drawio
evidence: >-
  operator approval 2026-11-05: auto-join on share link; hackathon closed so
  public-circle lookup is in scope to round off; archive = hide into collapsible
  section only.
archived_date: null
supersedes: null
superseded_by: null
---

# Flow simplification — membership, lookup, friend archive, gift suggestions

## Decisions (2026-11-05)

1. **Share link auto-joins.** A signed-in person who opens `/c/<slug>` gets an active
   friend membership (login-role upsert). Anonymous visitors still use the phone
   allowlist gate. No access-request gate for signed-in open.
2. **Hackathon closed.** Public-circle lookup and the rest of this plan are in scope to
   round off — not deferred as out-of-window. Recorded in `AGENTS.md` (deadline note).
3. **Archive = hide from the active list** into a collapsible **Archived** section on
   the dashboard. Ledger and money state are untouched. Unhide restores the row.

## Problem

The page-action map after chrome work still has sticky edges that feel like product
dead ends: `/lookup` always offers "create a proxy" and never opens an existing
circle; Add wish and Settings look unfinished on the diagram because outbound
actions were not drawn; friend "Gifts for others" has no hide/archive; sorting is
not by event date; unpurchased registry wishes are not suggested into circles.

## Recommended simplification (product)

### 1. Collapse create-only lookup into two honest paths

**Keep (narrow):** "Start a circle for someone" only when the person intentionally
wants a **proxy** surprise circle (no owner account yet). Quieter hub copy, not a
peer of return-home.

**Default join:**

1. **Share-link membership (auto-join).** Opening `/c/<slug>` while signed in upserts
   an active friend membership. That circle appears under **Gifts for others**.
2. **Find someone's public circles.** Look up by email or phone; list only
   `discoverable` active circles. Always-200: hit and miss share one body shape
   (empty list + proxy CTA on miss). Never confirm a number is unregistered.

### 2. Friend-side circle hygiene

Friends (and proxy creators) can **hide** a membership into **Archived** (collapsible).
Default sort both active lists by **event date ascending**, null dates last.

### 3. Suggest registry wishes into a circle

On Add wish (owner), suggest registry items not linked to this circle. v1 has no
`purchased` flag on registry rows — suggestions are "not yet linked here"; purchase
filtering waits on a later field if needed.

### 4–5. Diagrams

Page-action map shows Add → draft → confirm and Settings loops. Customer-journey
draw.io updates with this ship (auto-join + discoverable lookup).

## Success criteria

1. Signed-in open of an eligible `/c/<slug>` attaches membership and lists the circle on `/app`.
2. Hub presents proxy create quietly, not as the equal of open-my-circles.
3. Public-circle lookup lists only discoverable circles; hit/miss share status and body shape.
4. Friends can hide/unhide into Archived; lists sort by event date.
5. Add wish surfaces unlinked registry suggestions when any exist.
6. Page-action and customer-journey diagrams match the shipped join story.

## Failure criteria

- Lookup found-branch confirms a number has no account (distinct status/wording/shape).
- Friend archive deletes owner ledger or money state.
- Suggestions expose friend-only purchase state to the owner.
- Unsigned open skips the allowlist gate.
