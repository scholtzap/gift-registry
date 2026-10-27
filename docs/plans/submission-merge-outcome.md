---
title: "Submission merge outcome — PRs #1, #10, #11 landed and main verified"
type: plan
status: done
priority: P1
rank: 24
updated: 2026-10-27
apps: []
related: [docs/plans/rn-tracks.md, docs/plans/demo-video-validation.md, docs/plans/rn-f-claim-merge.md]
evidence: "PR #1 merged 2026-10-27T21:31Z; PR #10 and PR #11 merged same day; main f96728d"
archived_date: null
supersedes: null
superseded_by: null
---

# Submission merge outcome (2026-10-27)

**Status:** Done. Steps 3–6 of the owner's finish sequence are complete.

- **PR #11** (RN-F OTP gate record) and **PR #10** (diagram progress markers, demo-loop
  Playwright validation, lookup GET page) merged. The only conflicts were the generated
  plans index, regenerated at each step; PR #9's Paper Fiesta copy change was tracked in
  the demo-loop selector (`I’ll buy it myself`, curly apostrophe as rendered).
- **PR #1** (product spine, 201 files) merged into `main` after resolving a 30-file
  overlap in a throwaway worktree: schema unioned (countdown dates + nullable proxy
  owner), the single NULL-owner RLS fix kept alongside the spine's gate throttle, views
  and screens unioned, both migration families landing expand-only in timestamp order
  (`20261027150000` countdown, then `191957`/`193839`/`194041` registry-network).
- **Verified on merged `main` itself** (`f96728d`): `pnpm typecheck` clean,
  `pnpm leak` 145/145, `pnpm test` 487/487 (on the spine branch pre-merge),
  Playwright demo-loop 3/3 plus circle spec, `pnpm build` green.
- **Hygiene:** `git grep -nE '\+27[0-9]{8,9}'` clean; bare digit runs are int32
  constants, not numbers; `gitleaks detect` over 66 commits: no leaks; `.env` untracked
  (WABA ID and peppers live only there and in the VM secrets file).

Remaining before submission is step 7 only: record the 3-minute video from the tested
demo loop, and export the diagrams to PNG (needs draw.io Desktop or one manual open —
the checker proves geometry, not pixels). RN-F stays gated on Meta Business Verification
plus 30 days of message history; see `rn-f-claim-merge.md`.
