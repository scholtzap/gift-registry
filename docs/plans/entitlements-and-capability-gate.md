---
title: AI capability entitlements and the single can() gate
type: spec
status: ready
priority: P1
rank: 2
updated: 2026-10-26
apps: []
related: [SPEC.md, ARCHITECTURE.md, docs/plans/gift-circles-ten-day-build-plan.md]
evidence: SPEC.md §Decisions v1.1 (entitlements; consent vs budget), §Failure criteria (hard failure — a model call runs for a user who switched it off)
archived_date: null
supersedes: null
superseded_by: null
---

# AI capability entitlements and the single `can()` gate

**Status:** Decided into v1.1. Build shape below; the product decision and its rationale live in `SPEC.md`
§Decisions (v1.1) and the hard failure in §Failure criteria.

## Problem

Every model-spending path (voice transcription, photo extraction, link expansion, card pun, card art, assistant
copy, deal search) needs a per-user on/off switch that is the foundation for free/premium later. A gate retrofitted
after five paths exist is how one path gets missed, and a missed path is a consent failure, not a billing one.

## Success criteria

- `can(actor, capability)` is the only way any code reaches a model call, and a grep for model-call sites shows every
  one of them behind it.
- A **missing entitlement row fails closed** to the plan default, and a test asserts the missing-row case
  specifically (this is named as a false-success trap in `SPEC.md`).
- A capability switched off produces a **visible degraded path** with the reason shown — never a silent no-op, never
  a 500 carrying a model error.
- One actor can never read another actor's entitlement rows; the leak suite has a row for it.
- Turning a capability off removes the feature from the product with no redeploy (the gate is the feature flag).

## Build shape

- Migration (expand-only): `entitlements` table, `AiCapability` enum, `users.plan` (`free | premium | internal`,
  default `free`). Nullable-then-defaulted columns only; the previous image tag must still run.
- Capabilities: `voice_transcribe`, `photo_extract`, `link_expand`, `card_pun`, `card_art`, `assistant_reply`,
  `deal_search` (the switch exists before the feature does, so reviving the deferred deal spike needs no migration).
- `src/server/entitlements.ts` — `can(actor, capability)`, `assertCan(...)` throwing `EntitlementDenied`, and a
  `PLAN_CAPABILITIES` map used only when no row exists.
- Policies: `entitlements` gets RLS like every other table — `USING (user_id = app_user_id())` for both roles, no
  cross-read. Add to `src/server/db/policies/002_policies.sql` and re-run `pnpm db:policies`.
- UI: Settings → AI capabilities, one row per capability with a plain-language description of what it does and what
  happens when it is off. Upsert on `(user_id, capability)` so a double tap cannot create conflicting rows.
- Retrofit the three existing model paths in the same commit that adds the gate.

## Out of scope

Metering, usage counters, quotas, a pricing page, plan upgrades, payments. Circle-level policy control.

## Cut line

Never cut. This is a hard-failure guard, and it is the cheapest of the v1.1 additions.
