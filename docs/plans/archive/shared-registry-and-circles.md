---
title: Shared registry and circles dashboard — canonical items, link rows, per-circle visibility
type: plan
status: implemented
priority: P2
rank: 30
updated: 2026-11-01
apps: []
related: [docs/plans/registry-network-discovery-deviations.md, docs/plans/demo-video-validation.md]
evidence: sharewear lib/models/item.dart (sharedWardrobeIds, private), wardrobe_item_link.dart, owned_items_wardrobe_split.dart — interview 2026-11-01 (Q1–Q11, all R); accepted Final 2026-11-01
archived_date: 2026-11-01
supersedes: null
superseded_by: null
---

# Shared registry and circles dashboard

Built 2026-11-01 (post-submission track): `registry_items` + `circle_item_links`
(migration `20261101000000_shared_registry`, RLS `003_shared_registry.sql`), ledger
`src/server/ledger/registry.ts`, projections resolve visible links only, session-aware
`/app` dashboard (`src/server/views/dashboard.ts`), per-circle picker with mandatory
preview on `/c/<slug>/registry`, leak suite `tests/leak/shared-registry.test.ts` (11 green),
full suite 593 green, `pnpm build` clean. Ledger row 11 (owner return path) landed as the
session-aware `/app` dashboard. The browser `entry-hub` create flow fails in this dev
environment on the base tree too (same-origin 422; pre-existing, not a regression).

## Problem

Receivers retype wishes per circle, nobody can see all circles they have access to in one
place, and an item shared with two circles cannot be visible in one and hidden in the other.
Sharewear solved the same shape with canonical owned items plus join rows; this ports that
construction under this repo's owner-blindness and RLS-rows rules.

## Success criteria

- A receiver links one item into two circles with different visibility, and each circle's
  projection shows exactly its share (pinned by a leak test).
- The dashboard lists every accessible circle for owner and friend fixtures; counts match
  seeded memberships (owner sees owned + member, friends see member only).
- Non-goals for v1: migration tooling, link expiry, recipient onboarding, scoped slugs.

## Failure criteria

- A projection renders an item whose link is hidden for that circle → **refuse to ship**,
  fix, re-run the leak suite.
- The owner sees claim/pool state through the registry or dashboard → **refuse to ship**
  (surprise-rule breach).
- The dashboard lists a circle the viewer cannot open → **warn**, acceptable if the link
  still resolves; fix in a follow-up.
- Suite green but no per-circle preview step for the receiver → **degrade**: do not ship
  without the preview; it is the mis-set-flag backstop.

## Decisions & rationale

- **Decision (Q1): canonical `RegistryItem` owned by the receiver, `CircleItemLink` join
  rows carrying the per-circle visible flag, plus a `private` kill-switch copied from
  sharewear.**
- **Why:** per-circle visibility must be a *row* (the link): RLS filters rows, never
  columns. One source of truth — price/photo edits propagate. Dashboard and registry fall
  out of one construction.
- **Alternatives rejected:** registry-as-a-circle (claim semantics could leak onto registry
  type — high fallout); dashboard-only (leaves sharing as manual moves); scoped per-listing
  slugs (link sprawl, oversells revocation); approval-inbox-only (receiver labor, fatigue).
- **Status:** decided. **Revisit if:** the RLS rows-not-columns rule is ever lifted, or a
  prototype shows the phone picker is unusable.
- **Idempotency:** link/unlink keyed on (item, circle) — repeated links are upserts, never
  duplicates.

- **Decision (Q2): greenfield — wipe dev items, no migration path.**
- **Why:** pre-external-users, no real data; avoids carrying a dual item model (and dual
  leak assertions) even temporarily.
- **Alternatives rejected:** one-way adoption script (unneeded without real data); lazy
  adoption (lets the dual model linger).
- **Status:** decided. **Revisit if:** real external-user data exists when v1 builds.
- **Rollback path:** pre-user base — revert the commit; the wipe runs against dev data only.

- **Decision (Q3): owner sees owned + member circles; friends see member circles only, no
  registry view.**
- **Why:** the receiver needs both lists (wishes vs buying duties); friends gain nothing
  from a registry and might misread claim scope.
- **Alternatives rejected:** identical dashboard for all (confuses claim permissions);
  owner-only (hides buying duties from the receiver-as-friend).
- **Status:** decided. **Revisit if:** a friend-side use case (e.g. group pooling view)
  needs registry reads.

- **Decision (Q4): new links default hidden-until-shown.**
- **Why:** fail closed, like every other default here; a mis-set flag hides instead of
  exposing, and the preview step catches the rest.
- **Alternatives rejected:** visible-until-hidden (fail open on the privacy axis).
- **Status:** decided. **Revisit if:** receivers demonstrably publish to all circles and
  flag churn dominates (then consider default-visible with confirm).

- **Decision (Q5): proxy-circle items stay per-circle; canonical registries only for
  account-holding receivers.**
- **Why:** no recipient-onboarding flow exists to hook adoption onto; inventing one here
  smuggles an identity track into v1.
- **Alternatives rejected:** adopt-on-ownership-proof (no proof flow exists); mint registry
  at proxy create (orphaned objects with no owner).
- **Status:** decided. **Revisit if:** recipient onboarding lands.

- **Decision (Q6): ledger row 11 (owner return path) is a prerequisite, not parallel.**
- **Why:** a dashboard nobody can return to is a dead end, and row 11 is already owed.
- **Alternatives rejected:** parallel with mocked session (integrates against a shape that
  moves).
- **Status:** decided (ordering consumed on landing).

- **Decision (Q7): extend the `/app` hub with "My registry" + "My circles" sections.**
- **Why:** preserves the one-entry-door rule (CR-UX-01); a second surface doubles guard,
  leak-test, and explain-in-WhatsApp cost.
- **Alternatives rejected:** separate `/registry` surface.
- **Status:** decided. **Revisit if:** the hub grows too crowded on the 390px viewport.

- **Decision (Q10): ship directly, no flag; rollback = revert commit.**
- **Why:** zero external users — a flag doubles every projection test for no protected
  traffic.
- **Alternatives rejected:** env-flagged rollout.
- **Status:** decided. **Revisit if:** v1 slips past first external onboarding.

- **Decision (Q11): no link expiry in v1.**
- **Why:** after handover the surprise is spent; archived circles already tombstone the
  owner's view. A scheduler for an undemonstrated threat.
- **Alternatives rejected:** auto-expire at event date via the archive path.
- **Status:** decided. **Revisit if:** a concrete post-party exposure threat is shown.

## User flows

1. Receiver opens `/app`, sees "My registry" (their canonical items) and "My circles"
   (owned + member).
2. Receiver creates a registry item once (title, photo, price) — stored canonical, visible
   nowhere yet (hidden default).
3. Receiver opens the link picker for a circle: owned items split into available vs
   already-linked (sharewear `OwnedItemsWardrobeSplit` shape); toggling creates/removes
   link rows.
4. Receiver previews "view as this circle" before leaving; preview is mandatory, not
   optional.
5. Friend opens the circle link: sees only items whose link is visible there; claim/pool
   behavior unchanged.
6. Owner opens their circle: sees wishes only — never which links exist elsewhere, never
   claim/pool state. The dashboard never leaks cross-circle membership counts to friends.

## Out of scope

Migration tooling, link expiry, recipient onboarding for proxy circles, scoped share
slugs, approval workflow beyond the existing rn-j pattern, any change to claim/pool
mechanics, anything required for the 2026-11-04 submission video.

## Open questions

None. All Q1–Q11 answered 2026-11-01.

## Implementation steps

1. Land ledger row 11 (owner return path) first — the dashboard's session dependency.
2. Wipe dev items; add `registry_items` (owner-held canonical) + `circle_item_links`
   (item, circle, visible, added-by/at) with RLS mirroring the circle membership rules.
3. Read path: circle projections resolve items through visible links only; owner
   projection unchanged in shape (wishes only).
4. Hub: "My registry" + "My circles" sections, link picker with
   available/already-linked split, mandatory per-circle preview.
5. Leak tests: hidden link never renders; owner never sees cross-circle or money state;
   friend never sees the registry.
6. Playwright pass on the 390px viewport reusing the demo-loop harness shape.
