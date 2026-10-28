---
title: "UX CR-02: put the lookup/proxy creation flow inside the app shell"
type: plan
status: ready
priority: P0
rank: 3
updated: 2026-10-28
apps: []
related: [docs/operations/ux-audit-2026-10-28.md]
evidence: UX audit 2026-10-28 (Playwright, live + seeded local)
archived_date: null
supersedes: null
superseded_by: null
---

# CR-UX-02 — Style the creation entry

Covers F3, F7.

## Problem

`/lookup` and the proxy creation form render as unstyled HTML (no page shell,
no `/pinata.css`, no header). It is the first form a new organiser touches.

## Change requested

1. Render lookup screens through the same `page()` shell as the circle screens
   (brand head, CSS, service worker), or as proper Next screens.
2. Add the missing context at the top: “You are starting a circle for someone
   else. They never need an account; you will get a link to share with the
   group, and the plan stays hidden from them.” Then the number field.
3. Keep the always-200 privacy property and existing tests green.

## Done when

`/lookup` and every step after it look identical in shell and type to the
circle screens at 390px, with the explainer above the first field.

