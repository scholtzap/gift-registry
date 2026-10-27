---
title: "RN-H — on-platform search vs the noindex guarantee"
type: spec
status: draft
priority: P3
rank: 21
updated: 2026-10-27
apps: []
related: [docs/plans/rn-tracks.md, docs/plans/rn-b-lookup-route.md, docs/plans/rn-a-proxy-registry-spec.md, docs/plans/rn-i-submission-window-triage.md]
evidence: src/server/routes/circle.ts:46,50 (private, no-store + X-Robots-Tag noindex,nofollow), src/server/routes/circle.ts:90 (meta robots), src/app/c/[slug]/route.ts:6, src/server/auth/session.ts:95-108
archived_date: null
supersedes: null
superseded_by: null
---

# RN-H — crawlability and "search on our platform"

**Status:** Draft, and **recommended defer to after 2026-11-04**. This is a policy decision with one small
implementation, not an implementation track. If it is done at all in the submission window it should be the read-only
public view in RN-A/RN-B, not a search engine.

## Problem, and the reframe the owner needs to accept

The intent was written as "registry links accessible via web search on our platform". Read literally that means a
crawler over our own routes. That is not buildable without breaking a guarantee the repo already enforces:

- Every circle response is `private, no-store, max-age=0, must-revalidate` and `X-Robots-Tag: noindex, nofollow`
  (`src/server/routes/circle.ts:46,50`), with `<meta name="robots" content="noindex, nofollow">` in the document
  (`:90`). `src/app/c/[slug]/route.ts:6` names no-store as one of the three rules the adapter must not lose.
- Those headers exist because the friend projection contains who claimed what and how much money is behind it, and
  because the reveal must never be cached or previewed — a card rendered into a search index or a WhatsApp link
  preview is a spoiler delivered to the owner.

So: **a crawler cannot be the search feature, because the content it would crawl is deliberately uncrawlable.** The
on-platform search the owner actually asked for is a query over registry records — which is exactly RN-B's lookup
route — plus a deliberately public render path. Build that, and "search on our platform" is satisfied without a
second indexing system.

## What this track decides

| Option | What it means | Consequence |
|--------|---------------|-------------|
| A — search = DB lookup only (recommended) | `/r/<handle>` and the number lookup are queries against `circle`/`allowlist` rows, not an index | No new infrastructure. Headers stay as they are. Satisfies the intent. |
| B — index public registries for *internal* search | A separate allow-listed table of public circles feeds the lookup | Doubles the surface that can be stale: a registry flipped to private must vanish from the index, and an index has no RLS |
| C — publish to external search | Drop `noindex` on public circles | Reverses a shipped guarantee. Public registries appear in Google and in link previews, including for the owner |

**C is not a feature decision, it is a privacy decision.** A public registry that Google indexes is a person's gift
wishes indexed permanently, and a WhatsApp status link that produces a search snippet is a leak the product promised
not to make. Do not choose C to make the demo easier.

The one place the two do collide honestly: the owner wants to post the link to their **WhatsApp status** so strangers
can find them. Status already does that without an index — a status is a broadcast to your contacts. Record that the
distribution channel was never search, it was the status, and that RN-A's public-visibility flag is the feature.

## Handover brief for the planning agent

**Read:** `src/server/routes/circle.ts` (the header helpers and every caller), `src/app/c/[slug]/route.ts`,
`src/app/health/route.ts`, `docs/plans/rn-b-lookup-route.md`, `docs/plans/rn-a-proxy-registry-spec.md`; the tests
that assert no-store/noindex (search `tests/` for `noindex`, `no-store`).

**Definition of done:** a written decision (A, B or C) with the reasoning and the owner's sign-off; if A, an explicit
statement that no index exists and the lookup is a query, so nobody builds one later; if B or C, a documented answer
to "a registry goes private — how fast does it disappear, and who proves it did"; either way, the existing header
tests stay green and a new test asserts that a **public** circle's render path still cannot be cached by a shared
cache or previewed by a bot.

**Fail criteria — stop and report:** if any plan requires dropping `no-store` on a route that renders the friend
projection; if making a registry public requires editing the countdown files.

**Do not touch:** `src/server/routes/circle.ts` header helpers (they are load-bearing and tested), `src/server/views/`,
`tests/leak/`, `prisma/migrations/20261027150000*`.

## Out of scope

SEO, sitemaps, external backlinks, anything about `gifts.scholtz.work` ranking. Meta/Google contact import (impossible;
RN-I). The public landing page (`docs/plans/public-landing-page.md`) is a different artefact and already exists.

## Blocks / gated by

Gated by RN-I's triage answer (does on-platform search appear in the 3-minute video at all). Blocks nothing.
Recommend leaving it untouched until after submission.
