---
title: Pre-external-users hardening — rate limiting and security TODO before Meta/WhatsApp enablement
type: todo
status: done
priority: P1
rank: 2
updated: 2026-10-29
apps: []
related:
  - entitlements-and-capability-gate.md
  - gift-circles-ten-day-build-plan.md
  - parallel-build-closeout.md
  - whatsapp-task-bot-surface.md
evidence: Secure code review 2026-10-28 (4 workflow angles + inline corroboration); implementation 2026-10-29 verified by pnpm typecheck clean + pnpm test 55 files / 581 tests green + PII grep clean
archived_date: null
supersedes: null
superseded_by: null
---

# Pre-external-users hardening TODO — complete 2026-10-29

Secure code review for enabling Meta + WhatsApp APIs and opening the app to real external users.
Session/RLS/projection isolation **passed** from the start; everything below is now implemented
and green. Verify with `pnpm typecheck` + `pnpm test` (needs Postgres on 127.0.0.1:5433).

## 1. Rate limiting — done

- [x] **Shared limiter store.** `src/server/auth/throttle-store.ts` — Postgres `throttle_buckets`
  (lazy `CREATE TABLE IF NOT EXISTS`, expand-only, no migration) active when `TRUSTED_PROXY=on`;
  in-memory `checkGateThrottles` otherwise. Fail closed on store error (deny + 60s Retry-After);
  clock validated. N processes share one budget via one table (`SELECT ... FOR UPDATE` per key).
- [x] **Circle-gate key fixed.** `circle.ts` keys on `trustedClientAddress(request)`.
- [x] **`TRUSTED_PROXY=on` onboarding.** `.env.example` documents it (off locally); `env.ts`
  validates `TRUSTED_PROXY: on|off` (default off); `client-address.ts` + `throttle-store.ts` switch on it.
- [x] **Rotation-resistant buckets.** Per-key limits; every gate passes pair (5/min) + address-only
  (60/min) + global per-number (20/min). Tests in `tests/routes/throttle.test.ts` prove rotation
  does not help and denial consumes no budget.
- [x] **Hub open-post throttled.** `handleHubOpenPost(db, request)` (adapter updated) with address
  (60/min) + payload-hash buckets; same 429 + `Retry-After` shape.
- [x] **WhatsApp ingest throttled.** Per-sender (30/min) + per-business (300/min) in `webhook.ts`;
  denial stays 200 with no work queued (Meta retries non-2xx, so 429 would cause a retry storm).
- [x] **Authenticated write throttle.** Per-user (60/min) + per-address (120/min) after `privateActor`
  in `circlePost`; 429 + Retry-After, never 404.
- [x] **Uniform deny shape.** Same bodies + `Retry-After` everywhere.

## 2. Other security features — done

- [x] **[blocking] Login-CSRF on all session issuers (F1).** Shared `src/server/auth/same-origin.ts`;
  enforced in `circlePost`, `handleHubCreatePost`, and the lookup create branch (folds into the
  uniform offer body). Cross-origin-refuse tests in `hub.test.ts`, `lookup.test.ts`,
  `circle-actions.test.ts`, `permission-request.test.ts`, `lifecycle.test.ts`.
- [x] **[blocking] CI gates (F4).** `.github/workflows/verify.yml`: tsc + full vitest on Postgres
  16 service + gitleaks + no-real-numbers grep. Vitest runner itself was repaired along the way
  (root cause was Postgres down on 5433, masked by a vite8/vitest5 error-printer incompatibility).
- [x] **[important] CSP (F10).** `CONTENT_SECURITY_POLICY` in `shell.ts`, sent on circle/hub/lookup
  responses; only third-party allowance is `challenges.cloudflare.com` (Turnstile script + frame).
  Pinned by `tests/routes/security-headers.test.ts`.
- [x] **[important] Turnstile on gate/hub/lookup creates (F12).** Server seam
  (`src/server/auth/turnstile.ts`, fail-closed when `TURNSTILE_SECRET` is set, open seam otherwise),
  widget (`TurnstileWidget`) rendered in the gate, hub-create and lookup-create forms, env vars +
  `.env.example` docs, unit tests (`tests/auth/turnstile.test.ts`). Before external users: set
  `TURNSTILE_SECRET` + `TURNSTILE_SITE_KEY` in the VM secrets file.
- [x] **[important] Idempotency keys on money writes (F8).** `src/server/auth/idempotency.ts`
  (lazy table, 24h TTL, scoped to actor+circle); mount in `circlePost`; `<IdemKey />` in every
  item/draft/card money form; double-submit + scope tests in `circle-actions.test.ts`.
  Claim is insert-first so two concurrent first POSTs cannot both win; concurrent-claim
  regression test included.
- [x] **[important] Webhook freshness window (F7).** Future-dated messages dropped
  (`WEBHOOK_FUTURE_SKEW_MS` 5 min); past timestamps accepted deliberately — redelivery dedupes by
  `waMessageId` with a no-op upsert, so stale-but-valid payloads have no effect. Tests added.
- [x] **[important] Per-owner model spend quota.** `src/server/auth/spend.ts` (lazy `model_spend`
  table, keyed on the circle owner, `MODEL_DAILY_SPEND_LIMIT` default 200, fail closed);
  counted once per real call via `spend()` in `createModelClient`, wired in `modelsForActor`;
  `model_spend_exceeded` is non-retryable in intake and 422-with-plain-words on the card route.
  Tests in `tests/auth/spend.test.ts`.
- [x] **[important] whatsapp-api-js deviation recorded (F6).** Stays hand-rolled: raw-bytes HMAC +
  `timingSafeEqual`, 1 MiB/5 s bound, phone-number-id scoping, lookaside host-pin, MIME allowlists,
  5/16 MiB caps — all pinned by `webhook.test.ts`, `factory.test.ts`, `media.test.ts`. AGENTS.md
  mandates the lib; this file records the accepted exception (custom code carries its own tests).
- [x] **[important] Card/deal regression tests (F11).** `tests/routes/security-headers.test.ts`:
  CSP + no-store + nosniff on lookup/gate/owner-ledger, no `og:` tags anywhere in the shell, owner
  HTML carries no deal language or claim shapes. `deal_search` still default-OFF, no `web_search`
  call site; add an owner-projection guard test when it lands.
- [x] **[nit] Lookup/bot-reply parity (F14).** `reply` key always present (`null` when all-async);
  `verify_token` compared with `timingSafeEqual`. Per-path latency not padded (documented residual).
- [x] **Retailer-allowlist DNS/private-IP.** `assertPublicRetailerHost` in `link.ts`: every resolved
  address must be public unicast (IPv4 + IPv6), reject on DNS failure, injectable resolver, wired
  into `expandRetailerLink`. Residual TOCTOU documented (5 s bounded fetch, no redirects/creds).
  Tests in `tests/intake/link.test.ts`.
- [x] **PASS kept as regression suite (F13).** Plus new cookie-flag pins
  (`tests/auth/session-cookie.test.ts`: HttpOnly/Lax/Path/14-day/clear semantics).

## 3. Before real external users (ordered leftovers — deploy-time, not code)

1. Set `TRUSTED_PROXY=on`, `TURNSTILE_SECRET`, `TURNSTILE_SITE_KEY` in the VM secrets file.
2. Confirm replay-window policy stands (future-skew reject + idempotent dedupe — done, documented).
3. Run `git grep -nE '+27[0-9]{8,9}'` + full gitleaks scan immediately pre-publication (clean 2026-10-29).
4. Watch `MODEL_DAILY_SPEND_LIMIT` against the first real bill; tune per plan.
5. `verify.yml` went green on PR #36 after three first-run fixes: `prisma generate`
   before tsc/test (client is generated, never committed), `DATABASE_URL` in the
   test job env (env.ts requires it at import; the suite still only touches
   `_test`), and `pull-requests: read` permission for gitleaks on PR events.

## Residuals (named, not hidden)

- Per-path WA/lookup latency not padded (size/shape parity done).
- DNS TOCTOU on retailer fetch (bounded, documented).
- `model_spend`/`throttle_buckets`/`idempotency_keys` tables are lazy-created, not in Prisma
  migrations (expand-only by design; `prisma migrate deploy` unaffected).
- CI verify workflow is written but has never run green on GitHub (no remote run from here).
