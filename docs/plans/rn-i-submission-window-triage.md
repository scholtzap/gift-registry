---
title: "RN-I — submission-window triage: what of the registry network fits before 2026-11-04"
type: spec
status: ready
priority: P1
rank: 13
updated: 2026-10-27
apps: []
related: [docs/plans/rn-tracks.md, docs/plans/gift-circles-ten-day-build-plan.md, docs/plans/registry-network-discovery-deviations.md]
evidence: AGENTS.md (deadline 2026-11-04 21:00 ET, public repo, rubric Impact 30 / Meta tooling 25 / Technical depth 20 / Demo 25)
archived_date: null
supersedes: null
superseded_by: null
---

# RN-I — submission-window triage

**Status:** Ready. **This one needs the owner, not an agent.** About ten minutes.

## Handover brief

**Goal:** decide, in writing, which registry-network tracks are in the hackathon submission and which are
post-submission. Everything downstream is scoped by this answer, so it must be first.

**Read before answering:**
- `docs/plans/rn-tracks.md` — the table of nine tracks and the critical path.
- `AGENTS.md` §Build discipline — judgeable surface beats breadth; the demo is a 3-minute video; a feature that
  cannot be shown live or from a committed fixture is a plan, not a feature.
- `docs/plans/gift-circles-ten-day-build-plan.md` — what the remaining days are already carrying.

**Decide these four, in this order:**
1. Does a phone-number search appear in the 3-minute demo at all, or does the demo stay on the existing
   `/c/<slug>` gated-link journey?
2. If it appears: is the *proxy registry* (search a number, not found, create a circle for someone with no account)
   in the video, or only the "found" branch?
3. Is OTP (rn-f) attempted before 2026-11-04 knowing the authentication template takes up to 24h to approve and is
   always charged (`AGENTS.md` §Verified platform constraints)?
4. Is public crawlability (rn-h) deferred? Recommendation: **yes, defer** — `noindex` is load-bearing today and
   reversing it is a privacy decision, not a feature.

**Definition of done:** answers recorded in this file under a `## Decision` heading, with the date, plus any track
whose status changes to `out-of-window`, and `python scripts/ops/refresh_plans_index.py --write` with the diff read.

**Fail criteria:** stop and escalate if an answer requires a Meta product approval we do not have (Cloud API
upgrade, template approval, `user_friends` permission) — write the dependency down instead of assuming it lands.

**Do not touch:** `src/`, `prisma/`, `tests/`, `docs/diagrams/`. This is a scoping decision, not a build.

## Decision

Recorded 2026-10-27 by the owner (Wave 0, handover §3):

1. **Phone search appears in the demo — create-only.** RN-B is a create-only route inside the
   submission window (rn-d G1 answered YES): a lookup takes a number and always offers a proxy
   registry; it never renders an existing circle. The found branch is post-submission, returning
   only with `registry_profiles` plus a visibility field. Demo line: the threat model found phone
   lookup was an existence oracle, so we shipped the half that helps gifters and removed the half
   that outs them.
2. **The proxy (not-found) branch is the branch shown.** There is no found branch to show under
   create-only; the video shows search → no registry → create a proxy circle → share `/c/<slug>`.
3. **OTP is attempted early.** Request the WhatsApp *authentication* template now (always charged,
   up to 24h approval, AGENTS.md). RN-F stays gated: if the template is not approved, STOP and
   report — do not build a fake OTP door.
4. **RN-H is deferred past 2026-11-04** (`status: out-of-window`). `noindex` stays load-bearing.
5. **`TRUSTED_PROXY` defaults OFF** (rn-d open item closed). The localhost demo is
   unthrottled-by-flag rather than broken; on the VM, Caddy's header is trusted only when the
   flag is explicitly enabled there.

Consequences: rn-b narrows to create-only before it starts; rn-f is externally gated on template
approval; rn-h is out-of-window; rn-a, rn-d and rn-e proceed to `ready` now.

## Out of scope

Anything that needs an approval we do not control. If the answer to (1) is no, rn-b, rn-c, rn-f, rn-g become
post-submission plans and only rn-a, rn-d, rn-e stay worth writing now.
