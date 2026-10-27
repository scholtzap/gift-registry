---
title: "RN-B — the resolution lookup route: one key in, always 200 out"
type: spec
status: backlog
priority: P2
rank: 16
updated: 2026-10-27
apps: []
related: [docs/plans/rn-tracks.md, docs/plans/rn-a-proxy-registry-spec.md, docs/plans/rn-d-abuse-model.md, docs/plans/rn-c-proxy-circle.md]
evidence: src/server/routes/circle.ts, src/server/auth/phone-hash.ts, src/server/auth/throttle.ts, src/app/app/page.tsx
archived_date: null
supersedes: null
superseded_by: null
---

# RN-B — resolution lookup route

**Status:** Backlog. Do not start until RN-A and RN-D are `ready`. This is an implementation track.

## Problem

There is no route that turns "a person typed a phone number or a handle" into "here is the registry". `/app` is a
stub with no login and no search. The lookup is the hinge of the whole feature and it is also the surface with the
abuse potential, which is why RN-D gates it.

## The shape

A single endpoint: normalise the input to E.164, hash it with the existing keyed hash, look for a registry that
resolves to that key, and **answer 200 either way** — found renders that registry's entry view, not-found renders
the create-a-proxy form. The number is a lookup key, never a URL segment. The status code is not a signal.

Three constraints that fall out of code already in the repo, each of which the implementer must verify rather than
trust this file:

1. **A throttle exists and is not wired.** `checkGateThrottle` in `src/server/auth/throttle.ts` is imported only by
   its test. Nothing in `src/` calls it. RN-D found the deeper problem: there is no request-key source either — no
   middleware, no `x-forwarded-for` handling, and Caddy overwrites the header, so the client IP is not usable as-is.
   **Decide the key source in this track or the throttle cannot be mounted.** Note also that the demo is recorded on
   localhost with no proxy in front, so whatever key you choose must be testable where the video is made.
2. **`/c/<slug>` already distinguishes 404 from 200.** That is a working enumeration oracle for *slugs*, and the
   lookup route must not hand out a slug in a response body in a way that turns the new route into its mirror.
   Confirm the behaviour yourself before designing around it.
3. **There is no CSPRNG slug generator.** The only slug in the repo is the seeded one in `prisma/seed.ts`. An
   unguessable share slug is a new primitive this track owns.

## Handover brief

**Read:** `src/server/routes/circle.ts` (the request handling, the 404-not-403 rule, the cache headers, the gate
POST), `src/server/auth/phone-hash.ts` (`normalizeE164` and `hashPhone`), `src/server/auth/session.ts`,
`src/server/auth/throttle.ts` plus its test, `prisma/schema.prisma`, `src/app/app/page.tsx`,
`docs/plans/rn-a-proxy-registry-spec.md`, `docs/plans/rn-d-abuse-model.md` (its "Gates" section is your spec),
`AGENTS.md`.

**Definition of done:** the route resolves; a test asserts the response is 200 for both a registered and an
unregistered number and that the two bodies are indistinguishable apart from the branch content; a test asserts no
raw number appears in the URL, the response body, or a log line; the throttle is mounted with a named key source and
a test that a burst gets a different answer; `/c/<slug>` still resolves exactly as before (there is an existing test
that asserts the circle link never moves — keep it green).

**Fail criteria — stop and report:** if RN-D's answer is that no mitigation fits inside the submission window, then
this track does not start; if the only available key source for throttling is a spoofable header, say so rather than
mounting a throttle that looks like protection and is not.

**Do not touch:** `src/server/views/`, `src/lib/dates.ts`, `tests/leak/`, the countdown migration
`prisma/migrations/20261027150000*`, and any file the countdown build is editing in the main checkout.

## Success criteria

- Guessing numbers at this route tells an attacker nothing they could not learn by trying to create one.
- The route is fast enough to demo live and has a deterministic fallback for the recording.

## Out of scope

Sending anything to WhatsApp. Owner-side approval. Cross-referencing contact lists from any provider.

## Open questions

Does the found branch render inline or redirect to `/c/<slug>`? (A redirect re-introduces the slug oracle.) Is the
lookup available to an anonymous visitor or only to a signed-in gifter?

## Scope as narrowed by Wave 0 (2026-10-27)

Owner answered G1 **create-only** (rn-i §Decision): this route takes a number and always offers
a proxy registry; it never renders an existing circle in the submission window. One body, always
200, no `shareSlug` or `/c/` href in it (RN-D Gate: M-no-slug). The found branch is
post-submission. Open questions above are answered by this: no inline found render, no redirect;
available to a signed-in gifter only (RN-D M2 reuses the gate), never anonymous.

## Implementation gate — stopped here (2026-10-27)

Not implemented in the handover session. Precise gate: **no Postgres is reachable from the
dev machine** (Docker Desktop engine down, no `.env`/`DATABASE_URL` in the worktree), so the
route's always-200 indistinguishability test and the `pnpm leak` suite cannot be executed.
Shipping an unauthenticated route whose only proof is prose violates this file's definition of
done. Prerequisites in order, all still owed: (1) `trustedClientAddress` behind `TRUSTED_PROXY`
(default OFF, owner 2026-10-27); (2) CSPRNG `shareSlug` generator ≥16 chars; (3) `PHONE_HASH_PEPPER`
split (RN-D Gate 5); (4) throttle mounted ahead of every unauthenticated DB read. Start only
when a database is up and `pnpm leak` runs green on the untouched tree.

## Blocks / gated by

Gated by RN-A and RN-D. Blocks RN-F and RN-G. Parallel with RN-C once RN-A is settled.
