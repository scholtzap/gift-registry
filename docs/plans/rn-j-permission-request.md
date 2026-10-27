---
title: "RN-J — ask for access: the permission request and the owner inbox that is never pushed"
type: spec
status: draft
priority: P2
rank: 22
updated: 2026-10-27
apps: []
related: [docs/plans/rn-tracks.md, docs/plans/rn-a-proxy-registry-spec.md, docs/plans/rn-d-abuse-model.md, docs/plans/registry-network-discovery-deviations.md]
evidence: src/server/db/policies/002_policies.sql:60-68, prisma/schema.prisma (AllowlistStatus pending/accepted/removed), src/server/routes/circle.ts:397-451, docs/diagrams/pinata-discovery-access.drawio (noteLoop), docs/diagrams/pinata-registry-network-buildmap.drawio (N4)
archived_date: null
supersedes: null
superseded_by: null
---

# RN-J — the permission request

**Status:** Draft. This track exists because the flow is drawn in all three diagrams (`pinata-discovery-access.drawio`
`noteLoop`, `pinata-customer-journey.drawio` O5, `pinata-registry-network-buildmap.drawio` N4) and ledger row 5 of
`registry-network-discovery-deviations.md`, and no track owned it until now. It was a gap, not an oversight of the
diagrams.

## Problem

A person who fails the gate, or who lands on an invite-only registry, should be able to ask the owner for access.
Two of the product's non-negotiables make the obvious implementation illegal:

- **The reveal is a human act** — no send, no notification (`AGENTS.md`). A push to the owner would also break the
  rule that nothing leaves the app, and RN-D §4 verifies there is currently **no outbound send path in `src/` at all**.
  So the request cannot be delivered; it must be *found* when the owner next opens their own link.
- **404 never 403, and no route may confirm existence.** A "request access" button that only appears on a registry
  that exists is an enumeration oracle with a nice UI. On the invite-only path the requester already holds the slug,
  so this is safer than it looks — but the *response* to a request must not tell the requester whether the registry
  is real, private, or absent.

## What this track decides

**Storage.** `AllowlistStatus` already has `pending`. Do not add a parallel request table if a pending allowlist row
plus two columns (who asked, when) will carry it. Expand-only migration either way. Note that a *proxy* circle has no
owner to ask (`rn-a`), so the request path must have a defined answer when `owner_user_id IS NULL` — "nobody to ask,
say so in the always-200 body" is a valid answer, and the NULL-owner RLS trap in ledger row 10 applies here too.

**Surfacing.** Requests appear in the owner's own view when they next open `/c/<slug>`. Nothing is sent, nothing is
rendered to any other party, and the request text is the requester's own words — which means it is untrusted input
that will be rendered into an owner projection: validate length, no markup, and say which projection renders it.

**Approval.** Accepting adds a hashed allowlist entry for the number the requester proved, then returns the same
gated link. Rejecting leaves the requester exactly where they were. Both must be idempotent, and an approved row must
not become a second membership by accident.

**Expiry — take the shape from sharewear.** A pending request should expire, computed from stored dates rather than
written by a job: `C:\Users\apsch\Documents\personal\sharewear\lib\models\loan_graph.dart:27-40` expires a pending
borrow at the **earlier of** `createdAt + 72h` **and the end of the day that matters**, and `:4-17` derives "who must
act next" from the request instead of storing a second flag. Applied here: a request dies at the earlier of a fixed
window and the event date, and the owner's inbox shows what is derivable, not what was written. Do **not** copy
`expirePendingIfDue`'s trigger — it is called from a dashboard screen (`lib/screens/owner_dashboard_screen.dart:43`),
which only works because someone opens that screen.

**Abuse.** RN-D §4 is the input: an unthrottled request form is a spam channel against an owner's inbox, and the
throttle it would need is not mounted and has no key source (ledger row 12). A per-requester cap and one trusted
address helper, both owed by RN-B, apply here identically.

## Handover brief for the implementation agent

**Read:** `src/server/routes/circle.ts:397-451` (the gate and its session mint); `src/server/db/policies/002_policies.sql`
(especially `:60-68`, the membership/friend policies); `AllowlistStatus` and the allowlist table in
`prisma/schema.prisma`; `src/server/auth/phone-hash.ts`; `src/server/views/` for the owner and friend projections;
`docs/plans/rn-a-proxy-registry-spec.md`; `docs/plans/rn-d-abuse-model.md` §4-5.

**Definition of done:** a request that a gated-but-refused visitor can submit from the gate page and from an
invite-only miss; the submit response byte-identical whether or not the registry exists; the request rendered in the
owner projection only, with a test that it renders nothing in the friend projection; accept adds exactly one hashed
allowlist row and is idempotent; a pending request expires by derivation at the earlier of the window and the event
date with no scheduler; a test that the NULL-owner case is handled rather than thrown; the leak suite and the
`/c/<slug>` resolves test both still green.

**Fail criteria — stop and report:** if delivering a request requires any outbound send (it must not — escalate the
product rule instead of breaking it); if the throttle answer from RN-D is still open; if the surface would need the
countdown files in flight.

**Do not touch:** `src/lib/dates.ts`, `tests/leak/`, `prisma/migrations/20261027150000*`; one file per agent; no git,
no `refresh_plans_index.py`.

## Out of scope

Owner notifications of any kind. Chat between owner and requester. Revoking access after granting it (post-submission).
Requests against a proxy circle beyond the defined "nobody to ask" answer.

## Blocks / gated by

Gated by RN-A (schema and projection decisions) and RN-D (throttle, spam). Parallel to RN-C, RN-E and RN-F on files:
it touches the gate route and the allowlist, not the circle table. Nothing blocks on it except the ledger's row 5.
