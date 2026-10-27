---
title: Leak suite cannot prove red — LEAK_SKIP_POLICIES=1 leaves the previous run's policies in place
type: bugfix
status: implemented
priority: P1
rank: 10
updated: 2026-10-26
apps: []
related: [tests/leak/global-setup.ts, ARCHITECTURE.md, security_best_practices_report.md]
evidence: 2026-10-26 — pnpm leak 53/53 green; LEAK_SKIP_POLICIES=1 pnpm leak 4/4 files failed, 20/53 tests failed (pre-fix the same run was 0/53); policies restored green afterwards
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

**Amendment made while landing it:** dropping the policies alone is not enough. `002_policies.sql`
enables RLS on the guarded tables, and RLS *enabled with no policies* is default-deny — every
role-scoped read returns nothing, so assertions that expect a block still pass and the skip run
reads green for a different reason. The sweep therefore also runs
`ALTER TABLE ... DISABLE ROW LEVEL SECURITY` over `pg_tables WHERE rowsecurity`, which
`002_policies.sql` re-enables on the next normal run. Landed in `tests/leak/global-setup.ts`
as one `DO` block using `format('%I')` for every identifier.

## Failure criteria

- **Hard failure:** the flag is set and the suite is green — no test fails. Response: treat the
  suite as unverified and fix the harness before trusting any green run.
- **Expected under the flag:** every access-control assertion fails (2026-10-26: 4/4 files,
  20/53 tests). Policy-independent tests — pure `can()` gate logic, projection shape — still
  pass under the flag; that is correct, they never depended on RLS. A skip run in which *only*
  those pass is the red proof working.
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
