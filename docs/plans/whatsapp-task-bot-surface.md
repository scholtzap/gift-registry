---
title: WhatsApp task-bot surface — six bounded tasks, fixed menu, no free chat
type: spec
status: ready
priority: P1
rank: 5
updated: 2026-10-26
apps: []
related: [SPEC.md, docs/strategy/investigations/Meta-Model-API-and-WhatsApp-Cloud-API-findings.md, docs/plans/gift-circles-ten-day-build-plan.md]
evidence: SPEC.md §Decisions v1.1 (task-scoped assistant; hybrid split), §Failure criteria (hard failure — free-form reply), §User flows F13
archived_date: null
supersedes: null
superseded_by: null
---

# WhatsApp task-bot surface

**Status:** Decided into v1.1. This is the compliance floor of the product, not a nice-to-have.

## Problem

Meta's WhatsApp Business Solution Terms prohibit **general-purpose AI chatbots** on the Business Platform from
2026-01-15, with accounts registered on or after 2025-10-15 subject immediately — ours will be new. Task-specific
assistants remain permitted. The hackathon separately disqualifies projects that violate platform policies, so a
free-form chat surface is a submission risk, not just a ToS risk.

## Success criteria

- Exactly **six** bounded tasks exist: add by voice (F2), add by photo (F11), add by link (F3), status query, claim
  or join a pool via a 3-button reply, write your card message (F10 step 3).
- **Every unrecognised inbound message receives the same fixed menu.** The menu ships before any task does.
- The assistant is labelled as AI in its first reply and on the join page.
- The owner's status answer comes from the owner projection and therefore **cannot contain a claim, pool or
  contributor**; the leak suite asserts this at the route level, not only at the SQL level.
- Interactive messages are only sent inside the 24-hour customer-service window; anything outside it uses an approved
  template or does not send.
- No reply path can choose a task, change state, or generate an open-ended answer. Model use is limited to copy for
  the status answer and the card-message echo, both behind `assistant_reply`.

## Build shape

- Inbound router: one `switch` over an intent classifier that is **rule-first** (media kind, button payload, link
  detection) with the model used only to phrase an answer it did not decide. Default branch → fixed menu.
- Interactive payloads: reply buttons (max 3) for claim/pool; list messages only where ≤10 options genuinely apply.
- Card-message capture reuses the same ≤200-char, no-URL validation as the web composer, then echoes the stored line
  back for confirmation.
- Every send records what was sent and why, so a reclassification question can be answered from the log.

## Out of scope

WhatsApp **Flows**. Free-form conversation, ever. Outbound nudges as notifications (interactive messages cannot be
notifications). Group posting via the Groups API (it cannot post into a user's existing group).

## Cut line

Never cut the fixed menu — it is the compliance floor. If the six tasks cannot all land, ship intake (voice, photo,
link) plus the menu and move claim/pool/card-message to the PWA, and say so in the video.
