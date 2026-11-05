---
title: Consistent chrome, My circles, sidebar sections
type: spec
status: done
priority: P1
rank: 6
updated: 2026-11-05
apps: []
related:
  - docs/plans/owner-circles-return-home.md
  - DESIGN.md
evidence: >-
  operator feedback 2026-11-05; Stitch Paper Fiesta screens
  projects/4918037056990527388 screens ec4c22052cec4408bf95a1b75725dc10 (find desktop),
  dc20610a1f5043168f40231fb60c7f94 (verify CTA), c48f7c5afcf543ed880011dd111b391f (owner sidebar);
  docs/diagrams/pinata-page-action-map.drawio
archived_date: null
supersedes: null
superseded_by: null
---

# Consistent chrome, My circles, sidebar sections

## Success criteria

1. Every app and marketing screen shares the same chrome: brand → landing, **My circles** → `/app`,
   footer with brand, Guide, Privacy, Site built by, © 2026.
2. "Piñata home" / brand never opens `/app`; that is what **My circles** is for.
3. After Send my code, the verify notice is a success CTA ("Next: enter your code"), not an error banner.
4. Circle section links (Wishes / Add / Settings) live in the side menu (and mobile tab bar), not
   the top bar.
5. Stitch screens for find, verify, dashboard, owner ledger; draw.io page-map of actions.

## Failure criteria

- Brand on a circle screen still goes to `/app`.
- Section pills remain in the top bar on desktop.
- Verify "code is on its way" still uses `role="alert"`.
