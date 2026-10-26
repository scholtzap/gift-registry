---
title: Leak suite cannot prove red — LEAK_SKIP_POLICIES=1 leaves the previous run's policies in place
type: bugfix
status: ready
priority: P1
rank: 10
updated: 2026-10-26
apps: []
related: [tests/leak/global-setup.ts, ARCHITECTURE.md, security_best_practices_report.md]
evidence: null
archived_date: null
supersedes: null
superseded_by: null
---

# Leak suite cannot prove red (F-02)

## Problem

`tests/leak/global-setup.ts` is the only mechanism the repo has for proving that the privacy
suites actually test something. Its contract, stated in its own comment: *"A privacy test that
was never seen red is indistinguishable from a test that asserts nothing."*

The mechanism is broken. `LEAK_SKIP_POLICIES=1` stops **before** `applyPolicies()` and returns:

```ts
if (process.env.LEAK_SKIP_POLICIES === '1') {
  console.log('leak suite: policies SKIPPED (LEAK_SKIP_POLICIES=1) — expect red');
  return;
}
```

But it never *drops* the policies a previous run applied. `gifts_test` is persistent, so on the
second run onward the policies are already there, the flag changes nothing, and the whole suite
passes green while claiming to be red. Verified on 2026-10-26: all 13 owner-blindness tests
passed with the flag set.

The same defect nearly hid H-01. The `memberships_self_join` INSERT policy had no `circle_id`
predicate for a day and no leak test pinned it, because the one harness that would have flagged
an unguarded write path was silently a no-op.

## Fix

In `global-setup.ts`, when the flag is set, drop every policy on every guarded table before
returning — the same table list `applyPolicies()` iterates, so the two stay in step:

```ts
if (process.env.LEAK_SKIP_POLICIES === '1') {
  // Dropping, not skipping: the test DB is persistent, so last run's policies would still be
  // attached and the "expect red" message would be a lie.
  ... DROP POLICY IF EXISTS <name> ON <table> for every row of pg_policies ...
  return;
}
```

Enumerate from `pg_policies` rather than hardcoding names, so a policy added in
`002_policies.sql` is covered by the sweep the day it lands.

## Failure criteria

- **Hard failure:** the flag is set and any leak, views, entitlements or routes test passes.
  Response: treat the suite as unverified and fix the harness before trusting any green run.
- **False success:** `pnpm leak` green with policies applied, then a `LEAK_SKIP_POLICIES=1` run
  that is *also* green — that is this bug, and it is the state to refuse to merge in.

## Verification

Run both, in this order, and require the second to be red:

```
pnpm leak
LEAK_SKIP_POLICIES=1 pnpm leak   # must fail on the first access-control assertion
```

Until this plan lands, prove red the hard way instead: re-apply the pre-fix predicate inside a
transaction that rolls back, and confirm the pinned test fires against it. That is how H-01's
replacement test was validated on 2026-10-26.

## Out of scope

Adding policies to tables that do not exist yet (`wa_*`, `messages`). The sweep reads
`pg_policies`, so it inherits whatever `002_policies.sql` covers and needs no edit when the
spine grows.
