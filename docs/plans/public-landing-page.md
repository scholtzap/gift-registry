---
title: Public landing page at / and the /app route move
type: spec
status: ready
priority: P3
rank: 9
updated: 2026-10-26
apps: []
related: [SPEC.md, docs/plans/design-system-and-brand.md, docs/operations/demo-script-and-recording-checklist.md]
evidence: SPEC.md §Decisions v1.1 (landing page), §User flows F15
archived_date: null
supersedes: null
superseded_by: null
---

# Public landing page (F15)

**Status:** Decided into v1.1 for the Community Vote gallery.

## Problem

The Community Vote ($10K) and the judging panel send strangers to a URL. A voter who lands on a login screen bounces,
and the story of the product — one link into a group, friends coordinate, the card is handed over by hand — is
currently only tellable by watching the video.

## Success criteria

- `/` is **static**: the two-line problem, the three-step story, a screenshot strip from the seeded fictional cast,
  the demo video embed, and a CTA into the app. `Cache-Control: public, max-age=300`.
- It renders **zero circle data** and issues no dynamic query. A test asserts the HTML contains no circle identifier.
- There is no path from it to any card route, and no `og:` tag anywhere near a card surface.
- App screens move under `/app`. **`/c/<slug>` does not move** — that URL is already pasted into a WhatsApp group, and
  a test in the same commit asserts it still resolves.
- It uses the same token set as the app, so the screenshots and the product agree.

## Build shape

- One route file, no data fetching, no session read. Screenshots are committed build artefacts of the fictional cast.
- Route move ships in the same commit as the page; redirects are avoided for `/c/<slug>` by not touching it.
- Video embed: unlisted YouTube or self-hosted MP4 — see Open questions.

## Out of scope

A public gallery of demo circles (every public render of a ledger is a new leak surface in the week before
recording). Marketing copy beyond the story. Analytics. SEO beyond a title and description. Any signup form.

## Open questions

- Unlisted YouTube (needs network during Nov 5–8 judging) or self-hosted MP4 on the VM (bandwidth we do not have much
  of)? Decide by day 8.

## Cut line

First the screenshot strip goes (video embed only), then the whole page. Never cut `/c/<slug>`.
