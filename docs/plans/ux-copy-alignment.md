---
title: "UX CR-06: align site/guide/app copy with what is actually live"
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

# CR-UX-06 — Copy alignment

Covers F15, F16, F14.

## Change requested

1. Until DEMO_MODE is off, the app landing carries a plain “Demo” marker and
   the site hero stops saying the app is simply “live” without qualification.
2. Guide owner step 1 describes the real first step (create your circle in the
   app once CR-UX-01 ships; until then, say the WhatsApp/setup-link path as it
   actually works today).
3. Remove one of the two duplicated how-it-works tellings (site vs app
   landing) when CR-UX-01 collapses the doors.

## Done when

Every claim on `/`, `/guide` and `/app` can be done by a visitor today, checked
by walking the three pages against the live deployment.

