---
title: "UX CR-05: owner date form and in-app navigation targets"
type: plan
status: done
priority: P2
rank: 8
updated: 2026-10-28
apps: []
related: [docs/operations/ux-audit-2026-10-28.md]
evidence: UX audit 2026-10-28 (Playwright, live + seeded local)
archived_date: null
supersedes: null
superseded_by: null
---

# CR-UX-05 — Date form + navigation

Covers F9, F10.

## Change requested

1. Owner party-date form: pre-fill the current date, label it “Party date”,
   and only mark it required when no date is set. Keep the secrecy rule
   (whoever sets it last decides) unchanged and say so in the hint.
2. Inside the app, brand/Home returns to the entry hub (or the user's circle
   when a session exists), and the privacy link points at the app's own
   `/privacy` route under the deployment base path, not the marketing host's
   notice.

## Done when

Saving an unchanged date is never demanded, and no in-app link leaves the app
surface unintentionally at 390px.

