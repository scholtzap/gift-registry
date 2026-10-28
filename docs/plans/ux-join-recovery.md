---
title: "UX CR-04: join-gate error recovery"
type: plan
status: ready
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

# CR-UX-04 — Join recovery

Covers F8. After “We could not let you in with that number.” the next step is
unclear and competes with the primary Continue button.

## Change requested

1. On rejection, show what to check (full international form; the number the
   organiser invited) and make **Ask to be added** the primary action, keeping
   the typed name and number in place.
2. Keep the exact privacy wording and the always-generic error (no enumeration
   hints). The copy change is hierarchy and guidance, not new disclosure.

## Done when

A rejected friend can reach the request-access confirmation in one tap without
retyping, verified by a browser test against the seeded circle.

