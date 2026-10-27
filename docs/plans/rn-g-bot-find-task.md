---
title: "RN-G — find-a-friend as a bounded WhatsApp bot task"
type: spec
status: draft
priority: P3
rank: 20
updated: 2026-10-27
apps: []
related: [docs/plans/rn-tracks.md, docs/plans/rn-b-lookup-route.md, docs/plans/rn-f-claim-merge.md, docs/plans/rn-d-abuse-model.md, docs/plans/whatsapp-task-bot-surface.md]
evidence: src/server/agent/tasks.ts:5 (FIXED_MENU, six tasks), src/server/agent/tasks.ts:31-47 (routeWhatsAppTask; text is never model-interpreted), src/server/agent/dispatch.ts:11-40, src/server/wa/webhook.ts:23, src/server/wa/identity.ts:22-28
archived_date: null
supersedes: null
superseded_by: null
---

# RN-G — the bot's `find_a_friend` task

**Status:** Draft. Implementation track, second half of the critical path. Do not start until RN-B (the lookup route)
and RN-C (proxy circles) exist, and until RN-F's multi-circle answer is settled.

## Problem

The intended flow says a person can search a handle or number "in the bot" as well as on the web. The bot today has
six tasks and a seventh has to fit the existing constraints without turning the bot into the thing that breaks them.

## The constraints this must not break (all verified in code)

- **Six tasks is a compliance requirement, not a style choice.** `FIXED_MENU` (`src/server/agent/tasks.ts:5`) names
  them, and general-purpose chatbots are banned on the WhatsApp Business Platform from 2026-01-15. A seventh task must
  be a *task*, menu-launched, with a fixed grammar. It must not accept free-form chat.
- **Text is never interpreted by a model.** `routeWhatsAppTask` (`:31-47`) only routes from `audio`/`image`/`url`
  message kinds or a parsed `interactiveId`; plain text returns `FIXED_MENU`. So the number cannot arrive as typed
  prose — it must come from an interactive control whose payload the bot parses. Keep that property.
- **Interactive messages only work inside the 24-hour customer-service window**, reply buttons cap at 3, list
  messages at 10 sections / 24 rows. A phone number is not a good list of 24 rows. Decide the input control honestly
  and say what happens outside the window.
- **`selectActiveActor` returns `null` for a user with two active circles** (`src/server/wa/identity.ts:7`), so an
  actor who searches and joins a second circle may find the bot can no longer resolve them. RN-F owns that answer;
  RN-G must not invent a different one.

## What this track decides

**The bot reply is the enumeration oracle the web route works hard not to be.** RN-B's invariant is "always answer
200". A bot reply cannot do that by status code. If the bot says *"Found Nadia — here is her registry"* versus
*"No registry for that number, want to create one?"*, then the bot leaks registry existence to anyone who can text a
number, which is exactly the attack the slug design exists to prevent. Specify the reply so that found and not-found
are indistinguishable **in wording, in message length, and in latency**, and prove it with a test that compares both
replies. If that cannot be done, the finding belongs in the bot and not the web route.

**Consent before capability.** No model call and no dispatch without `can(actor, capability)` first — one gate, every
spending path. Add a named capability for search; a person who has switched it off must get the menu, not an error.

**Never store the number in plaintext in the bot path.** The bot receives it, digests it with the existing pepper
(`src/server/auth/phone-hash.ts`), and passes the digest to RN-B's service. The raw digits must not land in a message
log, a webhook audit row, or a reply echoed back to the user. Mask it in any confirmation ("…0030", not the digits).

**Stranger search.** A person can text any number, including one that is not their contact. RN-D's threat table is the
input here: this track must not start until RN-D has an answer about the throttle, because there is currently **no
mounted throttle and no usable key source** (see `rn-d-abuse-model.md`), and an unthrottled bot search is the cheapest
enumerate-by-number path in the product.

## Handover brief for the implementation agent

**Read:** `src/server/agent/tasks.ts`; `src/server/agent/dispatch.ts`; `src/server/wa/webhook.ts`;
`src/server/wa/protocol.ts` (interactive payload shape); `src/server/wa/identity.ts`; `src/server/auth/phone-hash.ts`;
`src/server/entitlements/` for `can()`; `docs/plans/whatsapp-task-bot-surface.md`; `docs/plans/rn-d-abuse-model.md`.
Tests to mirror: whatever exists under `tests/agent/` and `tests/wa/`.

**Definition of done:** a `find_a_friend` union member in `taskSchema` that is `.strict()` like the others and carries
a normalised number, reached only via an interactive id; a dispatch branch that checks `can()` before anything else;
found and not-found replies that are provably indistinguishable (a test that asserts the two reply strings have the
same structure and that neither confirms nor denies existence); no raw digits in any log line, reply body, or stored
column (assert with a test); `FIXED_MENU` text updated so the task count and names match the menu; existing agent and
webhook test suites still green.

**Fail criteria — stop and report:** if the only way to collect a number is free-text interpretation (that breaks the
banned-chatbot rule — escalate instead of building it); if the throttle answer from RN-D is still open; if a reply
cannot be written without leaking existence.

**Do not touch:** `src/server/routes/`, `src/server/views/`, `prisma/migrations/`, the countdown files
(`src/lib/dates.ts`, `tests/leak/`). One file per agent; no git, no index refresh.

## Out of scope

Web search on the platform (that is RN-H). Owner-side notifications for a search (none is the answer: the system
never delivers a message). Importing a Meta contact graph (impossible; `REQUEST_CONTACT_INFO` is tracked in RN-I).

## Blocks / gated by

Gated by RN-B, RN-C, RN-D and RN-F. Blocks nothing — it is the last track on the critical path.
