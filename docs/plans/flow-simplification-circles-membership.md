---
title: Flow simplification — membership, lookup, friend archive, gift suggestions
type: spec
status: draft
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
  operator questions 2026-11-05 after chrome PR #50; page-action map showed
  /lookup as a stub end and Add/Settings without destinations.
archived_date: null
supersedes: null
superseded_by: null
---

# Flow simplification — membership, lookup, friend archive, gift suggestions

## Problem

The page-action map after chrome work still has sticky edges that feel like product
dead ends: `/lookup` always offers "create a proxy" and never opens an existing
circle; Add wish and Settings look unfinished on the diagram because outbound
actions were not drawn; friend "Gifts for others" has no hide/archive; sorting is
not by event date; unpurchased registry wishes are not suggested into circles.

## Recommended simplification (product)

### 1. Collapse create-only lookup into two honest paths

**Keep (narrow):** "Start a circle for someone" only when the person intentionally
wants a **proxy** surprise circle (no owner account yet). Move it behind a quieter
hub link or under "More", not beside the primary return path.

**Replace the default join path with:**

1. **Share-link membership.** Opening `/c/<slug>` while signed in (or after OTP)
   upserts an active friend membership (subject to gate / allowlist / access
   request rules already in the product). That circle then appears under
   **Gifts for others** on `/app`. No paste-slug form required for the common case.
2. **Find someone's public circles.** From hub / dashboard: look up by email or
   phone and list only circles the target has marked discoverable/public (owner-
   created or friend-created public ones). Always-200 wording stays; never confirm
   that a number is "not registered" as absence. This is a deliberate revisit of
   Wave 0 create-only RN-B — gate behind `circles.discoverable` and abuse caps
   (RN-D) before shipping a found branch that lists slugs.

### 2. Friend-side circle hygiene

Friends (and proxy creators) can **archive / hide** a membership from their own
dashboard without tombstoning the owner's circle. Owner projection unchanged.
Default sort both dashboard lists by **event date ascending** (soonest first),
null dates last. Soft-hide is per-user; money/ledger state for the circle survives.

### 3. Suggest unpurchased registry wishes into a circle

When an owner (or friend adding to a proxy list, if allowed) opens Add wish, offer
**suggestions** from their registry items that are not linked to this circle and
not marked purchased/complete. One-tap "Add to this circle" creates the link row;
does not invent purchases. Owner-hidden friend-added items stay owner-hidden.

### 4. Draw Add / Settings destinations explicitly

Not product dead ends — diagram gaps. Page-action map must show:

- Add → draft confirm → ledger (or registry picker)
- Settings → entitlements toggles → back to ledger
- Optional: AI settings CTA on owner ledger → same Settings route

### 5. Customer-journey draw.io

**Do not rewrite** for chrome. Update when (and only when) RN-B leaves create-only
or friend archive ships — those change the gifter/owner spine the journey claims.

## Success criteria

1. Signed-in open of an eligible `/c/<slug>` attaches membership and lists the circle on `/app`.
2. Hub no longer presents create-only lookup as the equal peer of "open my circles" without
   a quieter proxy label.
3. Public-circle lookup (if shipped) lists only discoverable circles and never status-oracles absence.
4. Friends can hide/archive memberships; lists sort by event date.
5. Add wish surfaces unpurchased registry suggestions when any exist.
6. Page-action map edges for Add and Settings are complete; customer-journey untouched until RN-B/archive land.

## Failure criteria

- Lookup found-branch confirms a number has no account.
- Friend archive deletes owner ledger or money state.
- Suggestions expose friend-only purchase state to the owner.
- Customer-journey redrawn only for chrome chrome/nav.

## Open decisions (interview before implement)

1. Access request vs auto-join on share link for closed circles?
2. Is "public circles by email/phone" in-window for the hackathon, or post-demo?
3. Archive = hide from list only, or also leave the WhatsApp group mentally (copy)?
