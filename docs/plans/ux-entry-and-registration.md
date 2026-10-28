---
title: "UX CR-01: one entry door and a self-serve create-circle (registration) flow"
type: plan
status: done
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

# CR-UX-01 — Entry and registration

Covers F1, F2, F5, F6 from the UX audit. This is the reported bug and the
missing workflow behind it.

## Problem

- “Open Piñata” on `/app` links to `/app` (itself). Reproduced live.
- `/app/app` tells users to use an invitation link and offers nothing else.
- A birthday person cannot register or create their own circle on the web.
  Only proxy creation for someone else (via `/lookup`) and the not-yet-live
  WhatsApp bot exist.
- Site → app → app/app is three tellings of the same story with three CTA names.

## Change requested

1. Replace the app landing's primary action with a real entry hub (one screen):
   - **Create my circle** (new): name, occasion, party date (optional), your
     WhatsApp number, first wish (optional). Creates a circle you own, issues
     your owner session, lands on your wishlist with the share link prominent.
   - **Start a circle for someone** (existing proxy flow, renamed honestly).
   - **Open my circle**: paste a circle link or enter the slug.
2. Site primary CTAs point at the hub; the app landing keeps only the
   explainer and one button to the hub, same words everywhere (“Start your
   circle” / “Open my circle”).
3. The old `/app/app` content folds into the hub; no page tells users to go
   somewhere else without a way to do it there.

## Guardrails

- `/c/<slug>` does not move. Creation must reuse the existing ledger
  `createCircle` path and owner session issuance; no new auth model.
- Phone numbers are hashed at rest exactly as today. The form says why the
  number is asked for (friends join against it) before the field.
- A test walks: landing → hub → create → owner ledger shows the share link.

## Done when

A stranger can start at pinata.scholtz.work, create their own circle in under
two minutes, and paste a working `/app/c/<slug>` link into WhatsApp; no primary
button on any landing reloads its own page (asserted by a browser test).

