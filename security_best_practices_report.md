# Security review — Gift Circles (`gifts-registry`, branch `feat/schema-rls-leak-spine`)

**Mode:** report only (no source files modified) · **Skill:** `secure-code-review` (vibe-coded thirteen-pattern sweep + language guides)
**Date:** 2026-10-26 · **Reviewer:** agent, read-only static review
**Scope:** everything tracked that is code or config — see the coverage statement at the end.
This file replaces the previous pre-publication review that lived at this path.

---

## Executive summary

For a one-day-old, AI-written codebase this is an unusually disciplined security posture. The three-layer
privacy design is real, not decorative: RLS policies are row-correlated on every read path (the known
`users_circle_roster` bug is fixed and pinned by a test), owner-blindness degrades to a uniform 404 with
`private, no-store` on every branch of `/c/<slug>` that the code controls, the session is an HMAC-signed
cookie verified in constant time that fails closed to `null` on every kind of malformed input, the
entitlement gate fails closed on error, and the leak/views/gate/route test suites assert the invariants
rather than the happy path. HTML is escaped everywhere it interpolates; there are no client components, no
CORS surface, no outbound `fetch`, and no secret values committed (the working-tree phone scan is clean).

**No Critical findings.** Two High findings sit exactly on the product's own stated invariants: one RLS
INSERT policy that does not correlate to the session's circle — the same bug class the repo already fought
once, this time in `memberships` — and plaintext E.164 phone numbers in the `users` table, contradicting
the "stored only as a keyed HMAC hash" rule. The Medium cluster concentrates on the gate form that mints
sessions (CSRF, no throttling, a committed secret placeholder that passes validation), on write policies
that are broader than the invariants need, and on the absence of any CI enforcement of the security suites.
Most write-policy findings are **not reachable through today's two HTTP routes**; they are reported because
RLS is the declared backstop for every future route and agent toolset, and the backstop currently has holes
that no test pins.

Findings: **0 Critical · 2 High · 5 Medium · 8 Low · 6 Info.**

---

## Remediation status (same day, after the review was read)

Three findings are fixed, one proposed fix was **rejected as wrong**, and the review produced three
follow-ups of its own. Verified red-to-green in each case, not asserted.

| Finding | Status | Commit |
|---|---|---|
| H-01 uncorrelated `memberships_self_join` | **Fixed** — `circle_id = app_circle_id()` added, plus a leak assertion with a positive control | `a0968df` |
| H-02 plaintext `users.phone_e164` | **Diagnosis kept, fix rejected** — see below | `0f4cc51` |
| M-01 no CSRF on `POST /c/<slug>` | **Fixed** by Origin/Referer verification instead of a double-submit token | `a3dc155` |

**Why the H-02 fix was rejected.** Replacing `users.phone_e164` with a hash breaks the product: the
WhatsApp Cloud API addresses recipients **by phone number**, so the send path must be able to read the
number. It also mislocates the exposure. The column was never readable by the wrong *rows* — it was
readable by the wrong **columns**: `001_roles.sql` granted `SELECT ... ON ALL TABLES`, and RLS filters
rows and has no notion of columns, so `users_circle_roster` (a correct row policy) handed every friend
the whole group's numbers and BSUIDs inside the roster they were entitled to see. Fixing that by
revoking afterwards does not work either — a table-level `SELECT` implies every column, so
`REVOKE SELECT (phone_e164)` executes cleanly and changes nothing (`attacl` stays `NULL`,
`has_column_privilege` stays `true`). The grant on `users` is now an explicit column list. Post-fix,
verified on the test database: `SELECT phone_e164` and `SELECT *` as `app_friend` → `42501`,
`display_name` and `plan` still read, `count(*)` still works, and the login role still reads the number
for the send path. Plaintext at rest is now a *documented, accepted* residual rather than an invariant
violation, and the leak test says so.

**Three follow-ups the review missed** (all found while applying the fixes above):

- **F-01 — column exposure via the blanket grant.** The above. The report found the roster bug class but
  not the one grant that made a correct row policy leak a column anyway.
- **F-02 — `LEAK_SKIP_POLICIES=1` cannot prove red.** `tests/leak/global-setup.ts` runs
  `prisma migrate deploy` and then *returns* — it never drops the policies a previous run applied, so the
  whole suite passes with the flag set and looks like a green run. The suite's stated red-proof mechanism
  is therefore unreliable. The H-01 proof was done differently: the pre-fix predicate re-applied inside a
  transaction that rolled back (`cross-circle insert ACCEPTED` before, `REJECTED 42501` after). Fixing the
  flag is open — it needs a `DROP POLICY` sweep, not a skip.
- **F-03 — a session test that could pass or fail by luck.** `readSession` compares decoded HMAC bytes, and
  a 43-character base64url string for 32 bytes leaves the last character's two low bits as padding that is
  discarded on decode. The test flipped that character `'A'`↔`'B'` — same bytes, so the "forged" token
  verified roughly 1 run in 16. Now flips the first character, which always changes a byte.

**Residual risk after these three:** H-02's plaintext-at-rest (accepted, needs an encryption-at-rest or
deletion-path story before the first real user), and the un-throttled gate (M-02) — the Origin check stops
a cross-site form but not a direct scripted caller, which is now a POST to a public URL with no rate limit.
Still 0 Critical.

---

## Critical

None.

---

## High

### H-01 — `memberships_self_join` INSERT policy is not correlated to the session's circle (invariant #3 violation)

- **Where:** `src/server/db/policies/002_policies.sql:179-181`
- **Evidence:** `WITH CHECK (user_id = app_user_id() AND role = 'friend' AND status = 'active')` — no
  predicate mentions `circle_id` or `app_circle_id()`.
- **Flaw:** Any transaction running as `app_friend` may insert an active membership for **any circle UUID in
  the database**, not only the circle the session (`app.circle_id` GUC) is scoped to. This is the exact bug
  class invariant #3 names — a predicate that is equally true for every row — applied to INSERT instead of
  SELECT. Compare `items_friend_insert` (lines 214-221), which correctly requires `circle_id = app_circle_id()`.
- **Impact:** A friend actor that can reach any code path issuing an insert on `memberships` self-joins
  arbitrary circles, defeating the allowlist gate entirely and unlocking the full friend projection (secret
  suggestions, claims, pools, card messages) of circles it was never invited to. **Not reachable through
  today's HTTP surface** — the only membership write (`src/server/routes/circle.ts:202-206`) runs on the
  login role after the allowlist check — but RLS is the declared backstop for every future route, worker and
  role-scoped agent toolset, and no leak test pins this policy, so the first friend-scoped write path
  inherits the hole silently.
- **Fix:** `WITH CHECK (user_id = app_user_id() AND role = 'friend' AND status = 'active' AND circle_id = app_circle_id())`,
  plus a leak-suite assertion that a friend inserting a membership for a *different* circle is rejected with
  a row-level-security error (mirror the `cannot write a switch onto another user` test in
  `tests/entitlements/gate.test.ts:163-180`).

### H-02 — Plaintext phone numbers stored in `users.phone_e164` (invariant #6 violation)

- **Where:** `prisma/schema.prisma:136` (`phoneE164 String? @unique`), `prisma/migrations/20261026142427_init/migration.sql:50,237`,
  written at `src/server/routes/circle.ts:197-198` (`upsert({ where: { phoneE164: normalized }, create: { phoneE164: normalized, ... } })`).
- **Flaw:** The allowlist stores only `phone_e164_hash`, and `src/server/auth/phone-hash.ts:7-12` states the
  threat model explicitly ("a leaked table must not be a phone list"). But every user who passes the gate has
  their **plaintext E.164 number** written to `users`, globally unique across all circles. The policy file's
  own comment (`002_policies.sql:55-57`) acknowledges the danger: the earlier roster bug "returned the entire
  `users` table — `phone_e164` and `bsuid` for people in other circles included."
- **Impact:** Any database disclosure — backup leak, SQL injection in a future feature, or one more
  uncorrelated-policy bug of the kind that already happened once — yields a list of real names bound to real
  South African mobile numbers, which is precisely what the hashing design and the public-repo rule exist to
  prevent. It also makes `users` the highest-value target in the schema while the roster policy that guards
  it is one predicate away from leaking it again.
- **Fix (REJECTED after review — see Remediation status):** Replace `users.phone_e164` with `users.phone_hash` (keyed HMAC under a dedicated pepper, see
  L-01) and key the gate upsert on the hash — the plaintext number is then never persisted anywhere; the gate
  already computes the hash before the upsert (`circle.ts:183`). Expand-only migration: add the column,
  backfill `hashPhone(phone_e164)`, then drop the plaintext column in a later release.

---

## Medium

### M-01 — No CSRF protection on `POST /c/<slug>`, the endpoint that mints sessions

- **Where:** `src/server/routes/circle.ts:163-221`; cookie flags at `src/server/auth/session.ts:95-108`. No
  Origin/Referer check, no token; the gate form (`circle.ts:71`) contains no hidden token field.
- **Flaw:** `SameSite=Lax` protects *existing* sessions from being sent on cross-site POSTs, but it does not
  protect this endpoint, because the endpoint does not read a cookie — it **issues** one. A plain HTML form
  POST is a cross-site "simple request" (no preflight), and browsers accept `Set-Cookie` from the response.
  The skill's Next.js guide (NEXT-CSRF-001) explicitly says Route Handlers must implement CSRF protection and
  that SameSite alone is not sufficient.
- **Impact:** (a) *Login CSRF:* an attacker auto-submits their own allow-listed name+phone from the victim's
  browser, silently logging the victim into the attacker's circle — gifts the victim then "suggests" and card
  messages they write land in a circle the attacker controls and reads. (b) *Integrity:* anyone who knows a
  victim's allow-listed number can force-overwrite the victim's global `users.displayName` (see L-08), create
  or reactivate their membership, and flip their allowlist entry to `accepted`, all without the victim acting.
- **Fix:** Issue a per-form double-submit token (signed with `SESSION_SECRET`, bound to the circle id and a
  short expiry) as a hidden field; verify it before the allowlist lookup. Additionally reject POSTs whose
  `Origin`/`Referer` header is present and not the app's own origin (`CIRCLE_BASE_URL`, currently unused —
  see I-04). Keep `SameSite=Lax` (the WhatsApp in-app-browser rationale in `session.ts:100-103` is correct).

### M-02 — No rate limiting on the gate POST: unlimited phone guessing against the allowlist (Pattern 13)

- **Where:** `src/server/routes/circle.ts:186-193` (allowlist probe) — no throttle, backoff, or failure
  logging anywhere in the app; no middleware/proxy layer exists (`src/middleware.ts` absent).
- **Flaw:** The gate is the app's only authentication endpoint and it answers "is this number invited?" for
  free, forever. Responses are correctly uniform ("We could not let you in with that number", tested at
  `tests/routes/circle-link.test.ts:203-215`), but uniformity stops message-based enumeration, not volume-based
  guessing. The keyspace per circle is the set of invited numbers; a single hit yields the complete friend
  projection (items, claims, pools, card messages).
- **Impact:** An uninvited attacker who can reach the URL grinds candidate E.164 numbers at network speed
  against every circle slug they possess; one match is full membership. There is also no audit trail of
  failed attempts, so a successful grind is invisible.
- **Fix:** Per-IP and per-circle counters (in-DB is fine at this scale — e.g. a `gate_attempts` table or
  `ledger_events` rows) with exponential backoff after N failures per hour; log failed attempts; put Caddy's
  rate limiting in front once the VM deploy lands.

### M-03 — The committed `.env.example` SESSION_SECRET placeholder passes validation

- **Where:** `.env.example:16` (value not reproduced here — see the file) vs `src/lib/env.ts:13-16`
  (`z.string().min(32)`).
- **Flaw:** The documented setup step is "copy `.env.example` to `.env`". The placeholder is longer than 32
  characters, so a developer (or an agent) who copies the file and replaces every *empty* value still boots
  with the placeholder — a signing key that is committed to a repo that is about to become **public**. The
  same value doubles as the phone-hash pepper (`circle.ts:182`, see L-01), so one forgotten line compromises
  both session forgery and allowlist-hash computation.
- **Impact:** With the public placeholder as `SESSION_SECRET`, anyone can forge a valid owner-role session
  cookie for any circle UUID and read the owner projection, and can compute allowlist hashes offline to
  identify invited numbers. Fail-open by copy-paste, with no error at boot.
- **Fix:** Make `loadEnv` reject the known placeholder (compare against the literal committed string, or
  require high entropy — e.g. reject values matching `/^replace-with|^(.)\1{7,}/`). Alternatively change the
  example to a value that *fails* `min(32)` so boot refuses until it is replaced.

### M-04 — Friend/owner UPDATE policies are broader than the invariants require (write-side backstop holes)

- **Where:** `src/server/db/policies/002_policies.sql` —
  - `items_friend_update` (223-226): `WITH CHECK (app_actor_joined_circle(circle_id))` does not re-require
    `added_by_user_id = app_user_id()` or `visibility = 'friend_only'`. A friend updating their own item can
    flip `visibility` to `owner_visible` (revealing their secret suggestion to the owner outside the
    human-driven reveal, bypassing `reveal_ok`) or change `circle_id` to any circle they belong to.
  - `items_owner_update` (207-209): `USING` lacks `status <> 'tombstoned'`, so an owner UPDATE (which in
    Prisma returns the row) resurrects and re-exposes the owner's own tombstones — the rows the read policy
    deliberately hides (contrast `items_owner_read`, 189-195, and the comment at 204-206 that shows the
    authors know this trap).
  - `pools_friend_update` (259-262), `contributions_friend_update` (275-278), `gift_cards_friend_update`
    (355-357), `claims_friend_release` (244-246): any joined friend may mutate money- and card-adjacent
    fields (`target_minor`, `amount_minor` — only bounded by the `> 0` CHECK, `status`, `pun`, `tagline`,
    `item_id`) on rows belonging to *other* members.
- **Impact:** Not reachable through today's routes (no write endpoints exist yet), but these are the exact
  policies the future claim/pool/contribute/reveal routes and the friend agent toolset will run under; as
  written, the first such route that forwards a client-supplied id or field set becomes a cross-member money
  and owner-blindness breach, with no leak test pinning any of them.
- **Fix:** Pin identity and invariant fields in `WITH CHECK` (`added_by_user_id = app_user_id()`,
  `visibility = 'friend_only'`, `circle_id = app_circle_id()` for items; `buyer_user_id` unchanged for pools;
  forbid amount mutation after `marked_paid`/`settled` for contributions; add `status <> 'tombstoned'` to
  `items_owner_update` USING). Add leak-suite rows asserting each denial, following the
  `rejects.toThrow(/row-level security/i)` pattern already used in `tests/entitlements/gate.test.ts:168-174`.

### M-05 — No CI runs the security suites; the invariants are enforced only on the author's machine

- **Where:** `.github/workflows/` contains only `plans-registry-gate.yml` and `sync-notion-docs.yml`.
  `package.json` defines `leak` and `typecheck` but nothing invokes them in CI. `ARCHITECTURE.md:16` lists
  "+ CI test gate" under `.github/workflows/` — it does not exist.
- **Flaw:** Owner-blindness, 404-not-403, no-store-on-every-branch, the entitlement fail-closed contract and
  the gate behaviour are all pinned by tests that only run when someone remembers `pnpm leak`. A regression
  in `002_policies.sql` or `circle.ts` merges green.
- **Impact:** The repo's entire security story is "the leak suite catches it"; without CI the catch is
  optional, and this is a hackathon submission that goes public and gets judged on exactly these claims.
- **Fix:** Add a workflow (postgres:16-alpine service container, `DATABASE_URL_TEST` pointed at it) running
  `pnpm typecheck`, `pnpm leak`, and `pnpm audit --prod` on every push/PR; fail the build on any red.

---

## Low

### L-01 — `SESSION_SECRET` doubles as the phone-hash pepper (no key separation, rotation coupling)

- **Where:** `src/server/routes/circle.ts:182`, `scripts/seed.ts:15`, `tests/routes/circle-link.test.ts:168,197,221`.
- **Flaw/Impact:** One key signs sessions *and* keys the allowlist HMACs. Rotating a compromised session
  secret silently invalidates every allowlist hash (invited friends can never pass the gate again until
  re-invited), and the rotation fear will discourage rotating the session key. A single leak compromises both
  authentication and the phone-hashing layer.
- **Fix:** Add a dedicated `PHONE_PEPPER` to the env contract (`src/lib/env.ts`) and use it in `hashPhone`
  call sites; migrate existing hashes when H-02 lands anyway.

### L-02 — Unhandled errors on `/c/<slug>` escape the no-store contract

- **Where:** `src/server/routes/circle.ts:134-161,163-221` — no try/catch around `withActor`/`$transaction`;
  adapter `src/app/c/[slug]/route.ts:20-28` does not catch either.
- **Flaw/Impact:** A DB outage or the (correct) `role_switch_failed` throw in `src/server/db/client.ts:65`
  produces a framework-generated 500 that carries **no** `Cache-Control: private, no-store` header — the only
  response branch of the circle route not covered by the no-store test (`tests/routes/circle-link.test.ts:145-156`).
  It fails closed data-wise (nothing is rendered), but the invariant "no response on this URL is cacheable"
  is not literally true on the error branch.
- **Fix:** Wrap both handlers; on any error return `notFound()` (or the gate) with the `NO_STORE` headers and
  log server-side with the error *name* only, following `src/app/health/route.ts:29`.

### L-03 — No security headers (CSP / frame-ancestors / nosniff) on the HTML routes

- **Where:** `next.config.mjs` (no `headers()`), no middleware; HTML built by hand in
  `src/server/routes/circle.ts:54-61`.
- **Flaw/Impact:** The gate page can be framed (clickjacking the join flow — the form collects a real phone
  number), and the hand-rolled HTML strings have no CSP as defense-in-depth if a future edit misses an
  `escapeHtml` call. Current escaping is complete (verified every interpolation site), so this is hardening,
  not an open hole.
- **Fix:** Add `headers()` in `next.config.mjs`: `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` for `/c/:slug*` (and globally where harmless).

### L-04 — Dependency advisories: lodash via Prisma Studio chain; unused `pg-boss` runtime dependency (Pattern 8)

- **Where:** `pnpm audit --prod`: 1 high (GHSA-r5fr-rjxr-66jc, `_.template` code injection) + 2 moderate
  (GHSA-f23m-r3pf-42rh, GHSA-xxjr-mmjv-4gpg, prototype pollution), all `lodash <=4.17.23` via
  `@prisma/client → prisma → @prisma/studio-core → @visx/responsive`. `pg-boss@12.38.0` in
  `package.json` dependencies, imported by **zero** source files (only `next.config.mjs:6` and PLANNED docs).
- **Flaw/Impact:** Ranked by exploitability, not CVSS: the lodash chain loads only when a developer runs
  Prisma Studio locally — never bundled into the deployed Next.js server, no internet exposure → low.
  `pg-boss` is real and well-known (no slopsquatting), but an unused runtime dep is unneeded supply-chain
  surface in a public repo. Positive checks: `next@16.4.3` locked (above the 16.0.7 react2shell patch line),
  lockfile committed, every dependency a major publisher, `onlyBuiltDependencies` pinned to three entries.
- **Fix:** `pnpm update` when Prisma ships a patched studio-core; remove `pg-boss` until `worker/` exists;
  run `pnpm audit --prod` in CI (M-05).

### L-05 — `normalizeE164` accepts embedded `+` characters, breaking the canonical-form guarantee

- **Where:** `src/server/auth/phone-hash.ts:26-32` — `replace(/[^\d+]/g, "")` keeps every `+`; only the first
  character is checked, so `"++2760…"` and `"+2+7…"` pass and hash to non-canonical keys.
- **Flaw/Impact:** No bypass (a non-canonical hash simply never matches the allowlist — fails closed), but the
  same human number entered with a stray plus creates a distinct key, so a future `users.phone_hash` design
  (H-02) could mint duplicate identities. Availability/integrity only.
- **Fix:** After the leading `+`, strip or reject any further `+` (`if (num.includes('+')) return null`).

### L-06 — No slug-generation code yet; the only slug in the repo is a guessable word pattern

- **Where:** `scripts/seed.ts:41` (`"nadia-30th"`); no production circle-creation path exists. Existence
  oracle: `circle.ts:138-139` (404) vs `:144` (gate 200) distinguishes existing slugs — inherent to the
  product and safe **only** if slugs are high-entropy.
- **Flaw/Impact:** If circle creation follows the seed's human-readable pattern, anyone can enumerate active
  circles by guessing word slugs and then attack the gate (M-02) against a known circle id set.
- **Fix:** When the create route lands, generate `shareSlug` with ≥16 characters of CSPRNG entropy
  (`crypto.randomBytes` base32), and pin the entropy in a test the way `/c/<slug>` resolution is pinned.

### L-07 — Unauthenticated `/health` 500 enumerates table names; repo git hooks are dead on this machine

- **Where:** `src/app/health/route.ts:22-25` returns `rlsMissing: [<table names>]` to any caller during a
  policy outage. `.githooks/pre-commit` exists but `git config core.hooksPath` = `~/.config/git/hooks`
  (global), so the repo hook never runs, and the gitleaks secret scan is machine-local — a public-repo clone
  gets zero hooks.
- **Flaw/Impact:** Minor schema disclosure to unauthenticated callers at exactly the moment the app is
  misconfigured; and the secret-scanning guarantee AGENTS.md relies on is not repo-enforced for
  contributors or fresh clones.
- **Fix:** Return only the count (or `ok:false`) publicly and log names server-side; add a CI gitleaks job
  (folds into M-05) so scanning does not depend on one machine's config.

### L-08 — Gate POST overwrites the global `displayName` on every submission

- **Where:** `src/server/routes/circle.ts:196-200` — `update: { displayName: name }` on the phone-keyed
  upsert, executed on the login role (RLS bypass) with the POST body as the only input.
- **Flaw/Impact:** Any successful gate submission (including CSRF — M-01) rewrites the name shown across
  **all** circles that user belongs to, with no confirmation step; the card snapshot
  (`card_entries.display_name_shown`) limits but does not remove the blast radius (roster views and future
  card compositions read `users.displayName`).
- **Fix:** Set `displayName` only on `create`; on `update`, either skip it or require an authenticated
  self-service profile flow. Never let an unauthenticated form mutate an existing identity.

---

## Info

### I-01 — `$executeRawUnsafe` in `withActor` is safe today; add an explicit assert

`src/server/db/client.ts:52`: `` tx.$executeRawUnsafe(`SET LOCAL ROLE ${roleName}`) ``. `roleName` comes from
the hardcoded two-entry `ROLE_NAMES` map (line 10-13), never from request data; an unmapped role yields
`SET LOCAL ROLE undefined` → SQL error → transaction rollback (fails closed), and the `current_user`
assertion (61-66) makes a silent no-op impossible. Defense-in-depth: `if (!roleName) throw` before the call,
or keep a frozen `Set` of the two literal statements. The GUC calls correctly use parameterized
`$executeRaw` with `set_config(..., true)` (transaction-local).

### I-02 — The app's login role owns the tables and bypasses RLS on unscoped paths (accepted, documented)

Every `db.prisma.*` call outside `withActor` (slug lookup `circle.ts:138,164`, allowlist probe `:186-189`,
gate writes `:195-213`, fixtures, seed) runs as the table owner with no RLS. This is deliberate
(`tests/leak/owner-blindness.test.ts:132-136` pins it; `circle.ts` header comment documents the three
unscoped reads/writes and why). The gate's authorization is the allowlist hash match, which is correctly
correlated to `(circleId, phoneHash)` and checked *before* any write. Long-term hardening: separate the
migration-owner role from the runtime login role and/or `FORCE ROW LEVEL SECURITY` with SECURITY DEFINER
functions for the two gate lookups.

### I-03 — Money invariant holds

Integer minor units end-to-end (`priceMinor`, `targetMinor`, `amountMinor`), CHECK constraints
`> 0` / `>= 0` (`prisma/migrations/20261026142551_check_constraints/migration.sql:15-22`), no client-supplied
amount path exists. `formatMinor` (`src/lib/money.ts:5-9`) divides by 100 in float **for display only** —
deterministic and exact for integer minor units at any realistic magnitude; `toMinor(float)` is used by no
production path.

### I-04 — Cache/preview invariant holds and is tested; one dead env var

`force-dynamic` on both route adapters (`src/app/c/[slug]/route.ts:16`, `src/app/health/route.ts:5`);
`private, no-store, max-age=0, must-revalidate` on the gate, both projections, the 404 and the 303
(`circle.ts:26-30`, asserted in `tests/routes/circle-link.test.ts:145-156`); zero `og:`/`twitter:` tags
anywhere; `robots: noindex, nofollow` on every page; the gate never echoes the slug or submitted values.
`CIRCLE_BASE_URL` is required by `src/lib/env.ts:17` but read nowhere — it is the natural origin allowlist
for the M-01 fix.

### I-05 — No Prisma or Postgres language guide exists in the skill's references

The `references/lang-guides/` directory covers the Next.js/TS server stack (read and applied), general JS
frontend and React (read; **N/A — the repo has zero client components, zero `"use client"` files, zero
browser JS**), and other languages that do not match this stack. There is no Prisma-specific or
Postgres/RLS-specific guide. Per the skill's rule, findings that rest on Prisma adapter behaviour or
PostgreSQL RLS semantics (H-01, M-04, I-01, I-02) are judged against PostgreSQL 16 documented semantics and
the product's own written invariants rather than a bundled guide, and should be treated as slightly lower
confidence where they depend on framework internals — though H-01 and M-04 are readable directly off the
policy text.

### I-06 — Secret handling and logging are clean

`src/lib/env.ts` validates at boot and throws on invalid config (fails closed); no `NEXT_PUBLIC_*` variables
exist; no env dump or secret is ever logged (the only `console.error` calls are `health/route.ts:29` —
error *name* only, with an explicit comment about DSNs — and `entitlements.ts:126`, which logs capability,
userId and the error object; pg errors do not carry the connection string). `.env` is gitignored and not
tracked; `.env.example` contains no real credentials (the compose `gifts/gifts` pair is documented as the
local dev superuser); no secret-like strings exist in the tracked agent/MCP config JSONs; the test suite
generates synthetic phone numbers at runtime instead of committing fixtures
(`tests/routes/circle-link.test.ts:160-164`). Fail-closed review of every security-operation error path
(session parse, phone normalize/hash, allowlist lookup, entitlement gate, role switch, env load, formData
parse): **all fail closed**; no catch-all swallows an error into a permissive default.

---

## Vibe-coded thirteen-pattern sweep (Flaw / Impact / Fix)

Findings above are referenced by ID; patterns with no finding are stated clean with the evidence checked.

1. **Frontend wall / data hydration** — CLEAN. No client components exist; both projections are built
   server-side with explicit column projection (`src/server/views/index.ts:69-84, 102-140`) on top of RLS row
   filtering; the owner payload's *shape* is pinned (`tests/views/projections.test.ts:39`) and the route body
   is asserted free of any claim-shaped substring (`tests/routes/circle-link.test.ts:82-87`). No endpoint
   returns fields its renderer does not use.
2. **Hardcoded secrets** — findings **M-03**, **L-01**, **L-04** (unused dep). No key, token or credential
   literal exists in `src/`, `scripts/` or config; scanner hits in `.env.example` are the documented dev
   compose pair; scanner hits in `src/generated/prisma/internal/class.ts` are Prisma's own doc comments
   (generated, gitignored).
3. **Missing row-level security / IDOR** — findings **H-01**, **H-02**, **M-04**, **I-02**. All 14 tables
   have RLS enabled (`002_policies.sql:74-87`); every SELECT policy was read line-by-line and correlates to
   the row (roster function verified row-correlated at `002_policies.sql:58-66` and pinned by
   `owner-blindness.test.ts:100-121`); no fetch-by-sequential-id path exists (UUIDs everywhere).
4. **SSRF** — CLEAN (vacuously, today). Zero `fetch(`/axios/urlopen calls in `src/`; the Meta Model API and
   WhatsApp media-download clients are PLANNED modules only (`ARCHITECTURE.md:26-31`). **Must be re-audited
   when `src/server/wa/` and `src/server/models/` land** — media download by media-id and any URL intake are
   exactly this pattern's habitat.
5. **Injection (SQL / shell)** — CLEAN. All Prisma queries parameterized; the single `$executeRawUnsafe` is
   allowlist-mapped (**I-01**); `set_config` calls use `$executeRaw` interpolation-safe parameters
   (`client.ts:53-58`); the only string-interpolated DDL (`CREATE DATABASE`) is in test setup behind an
   explicit `^[a-z][a-z0-9_]{0,62}$` validation (`tests/leak/global-setup.ts:19-27`); no `child_process`
   with user input; `execFileSync` uses an argument array.
6. **Mass assignment** — CLEAN with one integrity note (**L-08**). The gate reads exactly two named form
   fields (`circle.ts:170-172`); every upsert/create enumerates its fields; no body spread reaches an ORM
   call anywhere. The `displayName` overwrite is the only client-influenced write to an existing row.
7. **Wildcard / reflecting CORS** — CLEAN. No `Access-Control-*` header is set anywhere; Next.js route
   handlers are same-origin by default; no OPTIONS handlers exist.
8. **Hallucinated dependencies** — CLEAN on existence (every package is a major, verifiable publisher;
   lockfile committed; `pnpm.onlyBuiltDependencies` restricts install scripts to esbuild/prisma). Findings
   **L-04** (unused `pg-boss`, lodash advisories in the dev-tooling chain) and **M-05** (no audit in CI).
9. **Unsigned / replayable webhooks** — NOT APPLICABLE today: no webhook receiver exists. `WHATSAPP_APP_SECRET`
   and `WHATSAPP_VERIFY_TOKEN` are provisioned in the env contract (`env.ts:20-21`). **Audit gate for the
   day-2/3 build:** signature over the *raw* body, constant-time compare, replay window, fail-closed 401.
10. **Client-side money math** — CLEAN. No money value crosses the client boundary in either direction yet;
    storage and checks are integer minor units (**I-03**). Re-audit when contribution/pool routes accept
    amounts: the server must recompute pool totals, never trust a submitted sum.
11. **Path traversal** — CLEAN. No filesystem access driven by request input; `policies.ts:5-11` reads a
    fixed directory with hardcoded filenames; `MEDIA_DIR` is configured but no media route exists yet.
12. **Token / session acceptance flaws** — CLEAN on verification: HMAC-SHA256 with `timingSafeEqual` and a
    length pre-check (`session.ts:73-75`), payload version pinned (`:86`), UUID shape enforced on both ids
    (`:87-88`), role whitelist (`:89`), expiry enforced (`:90`), uniform `null` for every failure mode
    (`:64-66`), HttpOnly + SameSite=Lax + Secure-in-production (`:96-107`). The `circleId` binding **is**
    enforced (`circle.ts:144`) and tested (`circle-link.test.ts:115-129`); forgery and tamper cases are
    tested (`:131-143, 258-273`). No server-side revocation exists, but RLS re-reads membership per query,
    so a removed member's live cookie yields 404 (documented at `session.ts:12-16`; roster test covers the
    `status='active'` requirement). Session-fixation is not applicable to a stateless signed token that is
    freshly minted at login. Remaining findings: **M-01** (CSRF on minting), **M-03** (key strength), **L-01**.
13. **Unthrottled auth / OTP endpoints** — finding **M-02**. Positive: identical responses for
    unknown/removed/invalid numbers (tested), submitted name and phone are never echoed back (tested at
    `circle-link.test.ts:211-214`), no codes or secrets in responses or logs.

### Per-pattern coverage statement

All thirteen patterns were audited. Clean: **1, 4 (vacuous — no outbound HTTP exists yet), 5, 6 (modulo
L-08), 7, 10, 11, 12 (modulo M-01/M-03/L-01)**. Findings: **2** (M-03, L-01, L-04), **3** (H-01, H-02,
M-04, I-02), **8** (L-04, M-05), **9** (N/A — no webhook receiver yet; flagged as a future audit gate),
**13** (M-02). No pattern was left unaudited.

---

## Public-safety scan (invariant #6)

- `git grep -nE '\+27[0-9]{8,9}'` across all tracked files: **0 hits**.
- `git grep -nE '\+[0-9]{9,15}'` across all tracked files (tests, fixtures, docs included): **0 hits**.
- Seed cast uses invented names + synthetic BSUIDs and **no phone numbers** (`scripts/seed.ts:6-22`); leak
  fixtures generate per-run synthetic `+999…` numbers at runtime
  (`tests/routes/circle-link.test.ts:160-164`, `tests/leak/fixtures.ts:7-26`).
- Working tree is clean; `.env` exists locally and is gitignored/untracked. History was not audited
  (out of scope per instructions — the previous report on file accepted history risk F1).

**Result: clean.** Note that H-02 concerns *runtime storage* of plaintext numbers, not committed data.

---

## Coverage statement

**Reviewed (all read in full):** `src/server/auth/session.ts`, `src/server/auth/phone-hash.ts`,
`src/server/db/client.ts`, `src/server/db/policies.ts`, `src/server/db/policies/001_roles.sql`,
`src/server/db/policies/002_policies.sql` (every policy checked for row correlation, command clause, and
USING/WITH CHECK symmetry), `src/server/entitlements.ts`, `src/server/routes/circle.ts`,
`src/server/views/index.ts`, `src/app/c/[slug]/route.ts`, `src/app/health/route.ts`, `src/lib/env.ts`,
`src/lib/money.ts`, `prisma/schema.prisma`, all three migrations, `scripts/seed.ts`,
`scripts/apply_policies.ts`, all six test files (read as coverage evidence), `docker-compose.yml`,
`.env.example`, `.gitignore`, `.gitattributes`, `.githooks/pre-commit` + effective `core.hooksPath`,
both `.github/workflows/`, `package.json` + locked versions in `pnpm-lock.yaml`, `next.config.mjs`,
`vitest.config.ts`, `tsconfig.json`, `prisma7.config.ts`, tracked agent-config JSONs (`.mcp.json`,
`.claude.json`), `pnpm audit --prod`, the phone-number scans above, and targeted greps (CORS, `fetch(`,
`$*RawUnsafe`, `process.env` outside env.ts, `console.*`, `dangerouslySetInnerHTML`, `og:`,
`use client`, `phoneE164`). Skill references read before judging: `vibe-coded-patterns.md`,
`cc-skill-security-review.md`, `backend-security-coder.md`, `api-security-best-practices.md`,
`security-best-practices.md`, `security-auditor.md`, `fix-snippets.md`, and the matching lang-guides
(Next.js server in full; general-JS and React frontend guides reviewed and determined N/A — no client
code exists).

**Not reviewed:** `src/generated/prisma/**` (generated, gitignored; scanner hits there were doc comments)
and `.next/**` (untracked build output); `scripts/ops/*.py` and `.cursor/hooks/*` (docs-registry tooling,
not the product attack surface — only the security-relevant DDL interpolation in test setup was checked);
`docs/**` prose except where it states security invariants; git history (per instructions — working tree
only); production infrastructure not in the repo (Caddy config, Oracle VM, nightly dumps); the WhatsApp
webhook, media pipeline, Meta Model API clients and agent toolsets (**they do not exist yet** — patterns 4
and 9 must be re-run when they land); runtime/dynamic behaviour — `pnpm leak` could not execute in this
environment (the `gifts-pg` Postgres container was not running and vitest failed at startup with a
source-map error), so all test-coverage claims are from reading the suites, not from a green run.

**Secret handling:** no secret value is reproduced in this report; the `.env.example` placeholder issue
(M-03) is referenced by location only. If that placeholder was ever copied into a live `.env`, rotate it.
