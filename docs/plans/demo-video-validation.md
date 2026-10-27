---
title: "Demo video validation — the 3-minute loop, replayed by Playwright before recording"
type: plan
status: ready
priority: P1
rank: 23
updated: 2026-10-27
apps: []
related: [docs/plans/rn-tracks.md, docs/diagrams/pinata-customer-journey.drawio, tests/browser/demo-loop.spec.ts]
evidence: AGENTS.md (the demo is a 3-minute video; a feature that cannot be shown live or from a committed fixture is a plan, not a feature)
archived_date: null
supersedes: null
superseded_by: null
---

# Demo video validation

**Status:** Ready. The recording is a deliverable, so the loop it shows is tested like one.

## The loop (what the video shows, in order)

1. Search a number → the same always-200 offer, whether or not a registry exists (RN-B create-only).
2. Create a proxy circle → paste `/c/<slug>` into the WhatsApp group (RN-C).
3. A friend asks to join → the owner finds the request on their own link and lets them in (RN-J). Nothing is sent.
4. Friends claim and pool behind one buyer → the owner sees wishes only, never the money.
5. After the day, the circle archives itself (RN-E). The card stays with the friends.

Step 5 is shown from the committed lifecycle tests, not live: no recording waits 72 hours.

## Validation design

- **One Playwright spec per loop step** (`tests/browser/demo-loop.spec.ts`), each with its own
  generated fictional numbers. This repo is public: no real number, name, or conversation, ever.
- **Deterministic by construction:** seeded fixtures (`tests/leak/fixtures.ts`), `DEMO_MODE=off`,
  no live model or Meta call anywhere in the loop. Network failure during recording cannot kill it.
- **Assertions are on what the camera sees:** headings, the gift title, the requester's name in
  the owner projection and its absence from the friend's, the claimed state. If a step's assertion
  fails, the video would have shown the failure — that is the point.
- **Pre-recording gate:** `pnpm test:browser tests/browser/demo-loop.spec.ts` must be green on the
  exact tree being recorded, after `pnpm leak` and `pnpm test`. No green run, no recording.
- **Viewport matches the story:** the suite runs at the configured 390×844 mobile viewport, the
  shape the WhatsApp in-app browser gives the judges.

## Fail criteria

Stop and fix, never record around: a step that needs a live API key, a real phone number, the
OTP template (RN-F is not in this loop until Meta approves it), or a manual database edit.
