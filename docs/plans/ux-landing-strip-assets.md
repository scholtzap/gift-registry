---
title: "UX CR-03: fix or remove the broken screenshot strip"
type: plan
status: done
priority: P1
rank: 6
updated: 2026-10-28
apps: []
related: [docs/operations/ux-audit-2026-10-28.md]
evidence: UX audit 2026-10-28 (Playwright, live + seeded local)
archived_date: null
supersedes: null
superseded_by: null
---

# CR-UX-03 — Screenshot strip assets

Covers F4. The app landing shows three broken images and a development note
naming a test file.

## Change requested

1. Run the opt-in capture (`SCREENSHOTS=1`, screenshots.spec.ts) against the
   seeded cast and commit the PNGs under `public/screenshots/`, or remove the
   strip until that is done.
2. Delete the “(tests/browser/screenshots.spec.ts)” copy from user-facing text.
3. Add a CI/local check that every `<img>` on the landing resolves (a browser
   test asserting naturalWidth > 0 is enough).

## Done when

No broken image and no file paths are visible on `/app` at 390px.

