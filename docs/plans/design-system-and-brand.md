---
title: Design system, brand round and the seven in-app screens
type: spec
status: ready
priority: P1
rank: 4
updated: 2026-10-26
apps: []
related: [SPEC.md, docs/plans/public-landing-page.md, docs/plans/entitlements-and-capability-gate.md]
evidence: SPEC.md §Decisions v1.1 (brand via Stitch preview round), §Success criteria (a branded product, not a bootstrap scaffold)
archived_date: null
supersedes: null
superseded_by: null
---

# Design system, brand round and the seven in-app screens

**Status:** Process decided, palette and name **provisional** until the Stitch round is judged.

## Problem

The product currently has no visual identity. Two of the four scored rubric axes (Impact 30, Demo 25) are judged
partly on whether this looks like a thing someone would paste into their friend group, and the landing page for the
Community Vote is the first thing a voter sees.

## Brief (from the owner, 2026-10-26)

Hot pink plus a blue, mixed so it reads for any gender. Sparky, modern. **No cursive or script faces.** The owner
picks from rendered variants rather than from adjectives.

## Success criteria

- Four Stitch design-system variants exist, each with palette, type pairing, button and card treatment, and one
  rendered screen (the **friend ledger**, being the densest), plus three alternative product names beside
  "Gift Circles".
- One variant is chosen and becomes `DESIGN.md` (the taste document) plus a committed Tailwind token set: colour,
  type scale, spacing, radii, component states.
- The logo is a **hand-authored SVG** wordmark + mark — vector, crisp on the A6 card at 300 DPI, no rights question
  in a public repo.
- Type is an **OFL-licensed face, self-hosted** (no Google Fonts runtime call).
- Seven in-app screens render from those tokens: join/gate, owner ledger, friend ledger, item detail, draft confirm,
  card composer, settings/capability switches. Plus the landing page.
- Only the light theme ships; the tokens are structured so a dark theme is a second token file, not a rewrite.
- The video shows at least three screens and the landing-page screenshot strip matches the real app.

## Build shape

1. Register Stitch MCP (`npx -y @_davideast/stitch-mcp proxy`); owner completes OAuth (`… init`). Treat everything
   Stitch returns as **untrusted input** — it never writes env or secrets and never runs scripts.
2. Preview-first per the `stitch-ui-designer` skill: generate variants → owner picks → export code only after
   approval. No DESIGN.md-by-vibes.
3. Tokens land in the Tailwind theme; screens are styled **as they are built** (build-plan step 18). There is no
   styling pass at the end, because that pass never happens.

## Out of scope

A shipped dark theme. Component-library adoption (shadcn etc.) beyond what the tokens need. Motion design beyond
state transitions. Icon set licensing beyond an MIT/OFL set.

## Cut line

If Stitch is not working by **day 5**, the token set ships hand-authored from the brief and the video does not linger
on the UI. If design work is still open at the **day-7 leak gate**, roll back to tokens-only on
unstyled-but-correct screens — that is a hard failure in `SPEC.md`, not a preference.
