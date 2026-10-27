# Piñata

**Group gifts nobody can spoil.** Piñata (Gift Circles) is a WhatsApp-native gift registry: an owner shares one `/c/<slug>` link, while friends coordinate claims and pooled contributions behind a single buyer. The owner sees their wishlist, not the group's gift plans. No money is held; payment settlement is manual.

Built for the Meta Global AI Developer Hackathon. This is an in-progress build, not a production service or a completed live Meta demo.

## Current status

Verified locally on **2026-10-27**: **393 Vitest tests across 34 files**, typecheck, production build, and **10 production Chromium flows passed**. The same browser flows also passed on the development server before the final security fixes.

- Paper Fiesta landing and seven screens are mounted on real routes. Native forms persist private drafts, claims/releases, pools/contributions/manual paid state, card entries and account settings. Owner and forged-friend card requests return private generic 404s.
- Signed webhook intake, deduplicated event/job commits, immediate explicit-demo media acquisition, consent-gated checkpoints, human confirmation and the actual pg-boss worker lifecycle passed real isolated PostgreSQL tests. Fixtures never turn on after a missing key or live failure.
- Cards use Satori/resvg with literal contributor text; synthetic vision tests prove person/mask refusal and atomic publication. Screenshot intake is not wired to live SAM or multi-cutout extraction.
- Live WhatsApp delivery, possession-verifying authentication, real Meta inference and Oracle deployment remain unverified. Multi-user purchase, circle creation and owner tombstone/pivot are incomplete. Gate throttling and the Windows owner-session workflow still need integration.

See [SPEC.md](SPEC.md), [ARCHITECTURE.md](ARCHITECTURE.md), [DESIGN.md](DESIGN.md), and the [work queue](docs/plans/PLANS_INDEX.md). The [release-hygiene audit](docs/operations/parallel-agent-outputs/release-hygiene.md) records checks actually performed and remaining integration blockers.

## Stack and prerequisites

- Node.js **24+**, pnpm **10.33.0** (the version declared in `package.json`).
- Next.js 16 / React 19 / TypeScript / Tailwind CSS 4.
- PostgreSQL **16**, Prisma **7.10.1**, `pg`, and the Prisma PostgreSQL adapter.
- Vitest and Playwright Chromium, including real isolated PostgreSQL integration tests.
- Card/image dependencies: `satori`, `@resvg/resvg-js`, and `sharp`. Native binaries must match the deployment architecture.
- Docker Compose v2 is optional for the local database. `pnpm worker` starts the pg-boss ingest consumer; its local polling/completion/shutdown lifecycle is tested.
- ffmpeg and provider credentials are needed for live voice/media. Conversion arguments and WAV validation are tested with an external runner fake, not a live FFmpeg binary.

## Local setup

Run these commands from the repository root. Local tests use a separate disposable PostgreSQL database; fresh-checkout installation and Oracle deployment still need their own verification.

### 1. Dependencies and configuration

```powershell
pnpm install --frozen-lockfile
# Fresh checkout only: do not overwrite an existing local configuration.
Copy-Item .env.example .env
```

Keep `.env` local. Use `.env.example` for configuration names and harmless placeholders only. Supply real credentials through a secret manager or private runtime environment; never paste them into chat, screenshots, source, or build arguments. Never use `NEXT_PUBLIC_` variables for provider credentials.

| Configuration | Purpose |
|---|---|
| `DATABASE_URL` | Development/runtime database connection; credential-bearing, private |
| `DATABASE_URL_TEST` | Separate, disposable test database; never the development or production database |
| `SESSION_SECRET` | Random private signing secret, at least 32 characters; also used as the allowlist-hash pepper |
| `CIRCLE_BASE_URL` | App's canonical origin; use `http://localhost:3000` for local development |
| `PORT` | Declared port setting, default 3000; ensure the server/proxy uses the same port |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Local Compose database initialization; password is private |
| `DEMO_MODE` | Exactly `on` or `off`; default **off** |
| `MEDIA_DIR`, `FFMPEG_PATH` | Private media directory and ffmpeg executable path |

`src/lib/env.ts` validates required configuration at import time. Missing provider keys are optional in that contract; they do **not** enable demo mode. Configure a writable local media directory rather than relying on the Linux `/data/media` default on Windows.

### 2. Database, migrations, and policies

The root `docker-compose.yml` currently starts **PostgreSQL only**, bound to `127.0.0.1:5433`, with a named volume. Set the Compose variables before starting it, and point your development connection at that database.

```powershell
docker compose up -d postgres
pnpm exec prisma generate --config prisma7.config.ts
pnpm exec prisma migrate deploy --config prisma7.config.ts
pnpm db:policies
pnpm db:seed
```

The config has a nonstandard filename. Package scripts and the test setup now consistently pass `--config prisma7.config.ts`; the local integrated suite exercised migration/config discovery.

Policies are a **separate deployment step**, not something Prisma migrations represent. Apply them after every schema deployment. The applying login needs authority to create/grant the two roles and install policy functions. Use a controlled migration/admin account for these operations; never expose that credential to browsers.

`db:seed` creates a fictional cast and `/c/nadia-30th`, with wishlist, secret suggestion, claim, and pool state. It does not erase an existing circle or reset a recording. Its allowlist hashes synthetic BSUID tokens, not phone numbers, so typing an invented number into the join form is **not** a seeded login mechanism. Do not add real subscriber numbers to make the demo work. Owner/friend demo access needs a separately verified session/bootstrap flow; route tests exercise signed sessions directly.

### 3. Run

```powershell
pnpm dev --hostname 127.0.0.1
```

Open `http://localhost:3000/health` and `http://localhost:3000/c/nadia-30th` after seeding. The latter shows a gate without a valid circle-scoped session. `/` is the public landing; `/app` explains invite entry without exposing a private demo circle.

Start the ingest consumer separately with `pnpm worker`. No outgoing WhatsApp sender or automatic card delivery is included.

## Privacy and consent boundaries

- **One ledger, two projections.** `src/server/views/` builds different owner and friend payloads. Friend suggestions remain owner-hidden until an explicit reveal; owner deletion is a tombstone, not destruction of the friends' ledger or money state.
- **One DB entry point for actor data.** `withActor()` in `src/server/db/client.ts` starts a transaction, switches to `app_owned` or `app_friend`, sets actor/circle context with transaction-local settings, and asserts that the switch succeeded. Both roles are `NOLOGIN`.
- **RLS is structural, but privileged reads bypass it.** The current login owns tables and can switch roles. Unscoped service/bootstrap paths therefore require deliberate review; do not call the raw client for actor-visible responses or mistake the table-owner login for an RLS-protected reader.
- Owners have no read policy on claims, pools, contributions, card entries, or gift cards. Row denial yields zero rows. The `users` grants additionally restrict identity columns: friends cannot read the group's phone numbers or BSUIDs through roster queries. Allowlist entries hold keyed hashes; operational user records can still contain phone numbers for delivery.
- Signed cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production. `/c/<slug>` responses use `private, no-store` and indistinguishable not-found responses. Knowing an allow-listed number is **not** proof of possessing it; the current form is not a completed OTP authentication flow.
- **Every model-spending path must first pass `can()` / `assertCan()`** using the triggering actor's transaction. User opt-outs survive inherited grant expiry; toggles clear expiry. Off means no model call; gate outages fail closed. Provider integration must preserve that rule.
- Long ingest session locks use a separate bounded pool from Prisma actor queries. Both pools have acquisition timeouts; failed unlock discards the session.
- Gift cards are friend-only and human-delivered: no automated send, notification, Open Graph card preview, or cacheable card response. Real route/DB/browser tests verify exclusion and PNG retrieval locally; live deployment is still unverified.
- No person pixels may be stored in a product cutout. Person detection must precede segmentation/storage, and a person-containing fixture must prove refusal.
- The WhatsApp assistant is task-scoped to the fixed six-task menu; it must not become a general-purpose chatbot or choose state transitions itself.

## Demo mode and live Meta setup

`DEMO_MODE=on` is an **explicit configuration switch**, not a promise that every fixture path is implemented. There must be no automatic live-to-fixture substitution after a missing key, failed consent gate, or provider outage. Clearly label demo output; keep live failures visible. Seed data alone is not Meta inference.

Provider configuration is separate from the database setup:

| Configuration | Requirement |
|---|---|
| `MODEL_API_KEY` | Private Meta Model API key; contract expects the provider's `LLM_` prefix |
| `MODEL_API_BASE_URL` | Default `https://api.meta.ai/v1` |
| `MODEL_INTAKE`, `MODEL_VISION` | Default `muse-spark-1.2`; do not substitute degraded Spark 1.3 audio understanding |
| `MODEL_TRANSCRIBE`, `MODEL_IMAGE` | Default `muse-voice-transcribe-1.0` and `muse-image-1.0` |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | Private webhook signing/verification credentials |
| `WHATSAPP_ACCESS_TOKEN` | Private Cloud API access token; declared in the env contract |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_GRAPH_API_VERSION` | Business phone identifier and Graph version configuration |

The intake client pins Spark 1.2 and Voice Transcribe 1.0 for these tasks; declared model defaults do not imply additional wired model features.

Follow the [Meta setup checklist](docs/operations/meta-integration-setup-checklist.md), treating its unchecked tasks as requirements, not deployment evidence. Confirm billing/access and enabled models for the actual account. The raw-body `/api/wa/webhook` route is mounted and locally tested; HTTPS registration, sandbox permissions, live BSUID envelopes and physical-device ingestion still need authorized verification.

Use the **official WhatsApp Cloud API**. The approved `whatsapp-api-js` package is an independent MIT wrapper around that API, **not an official Meta SDK**, and was not yet declared in the inspected manifest. Never use WhatsApp Web/reverse-engineered clients. Store incoming media bytes promptly: media IDs expire after seven days. Convert WhatsApp Ogg/Opus to RIFF/WAVE mono 16-bit PCM at 16 kHz before transcription. OTP requires an approved **authentication** template. Interactive replies require the 24-hour service window; outside it, approved templates are required. Deal discovery may use Model API `web_search`, never prohibited Marketplace scraping, and deals reach friends only.

## Tests and commands

```powershell
pnpm typecheck
pnpm leak
pnpm test
pnpm test:browser
$env:NEXT_DIST_DIR = '.next-verification'
pnpm build
$env:PLAYWRIGHT_PRODUCTION = '1'
pnpm test:browser
Remove-Item Env:PLAYWRIGHT_PRODUCTION, Env:NEXT_DIST_DIR
# For an ordinary default-directory build/start:
pnpm build
pnpm start --hostname 127.0.0.1
```

| Command | Scope |
|---|---|
| `pnpm leak` | Vitest leak, projection, entitlement, and route directories |
| `pnpm test` | All configured Vitest tests, including backend and screen suites |
| `pnpm test:browser` | Ten mounted Chromium flows; starts loopback Next dev, or production with `PLAYWRIGHT_PRODUCTION=1` |
| `pnpm worker` | Run the ingest queue consumer separately |
| `pnpm db:policies` | Apply checked-in role/policy SQL and report missing protection |
| `pnpm db:seed` | Fictional development/demo data; not a production migration |
| `pnpm db:migrate` | Author development migrations using the explicit Prisma config |
| `pnpm db:deploy` | Apply committed migrations using the explicit Prisma config |

Vitest global setup applies migrations and policies to `DATABASE_URL_TEST` and may create that database via the same server's `postgres` database. Use a dedicated test server/account with the necessary privileges. This is real PostgreSQL testing and is not safe against valuable data. Final local results are 393/393 Vitest cases, typecheck/build, and 10/10 production Chromium cases.

Do not set `LEAK_SKIP_POLICIES=1` for ordinary tests: it **drops policies and disables RLS in the test database**. New security regressions were reproduced through public behavior without removing policies. Browser setup signs fictional scoped sessions directly; it does not certify OTP or possession-verifying login.

## Deployment and failure modes

Oracle ARM deployment templates are being added under `docs/deployment/`; their existence is not evidence of an executed deployment. The root Compose file is still only the local database. Before deployment, validate native image/rendering packages on ARM64, licensed fonts, private persistent media storage, TLS, secret injection, migrations followed by policies, backups, and a restore drill. On this Google Drive-synced Windows checkout, materialize reparse-sensitive files before Docker builds.

Never auto-roll back production migrations. Use expand-only schema changes; recovery is the previous image tag plus a verified database restore. Keep PostgreSQL private. A live deployment should use production cookies and a reverse proxy; bind the application locally or to a private container network.

| Symptom | Meaning / response |
|---|---|
| `Invalid environment` | Supply the named configuration privately; restart after changes because the env object is cached |
| Prisma config/schema discovery failure | Use the explicit config path above; package scripts and test setup already pass it |
| `/health` returns 503 | Database check failed; inspect redacted diagnostics without printing connection strings |
| `/health` returns 500 with `rlsMissing` | Missing RLS/policies; refuse service and apply reviewed policies |
| Circle shows a gate or not-found | Missing/wrong/expired session or revoked access; not a reason to widen RLS grants |
| Model capability off/unavailable | Refuse spending; show manual/degraded flow, never silently retry or fabricate success |
| Missing native renderer/font/ffmpeg | Validate platform artifacts and licensed local font/audio tooling; do not substitute an unreviewed remote fetch |

Health checks count policy presence; they do not prove every policy predicate is correct. Run the privacy suite against the exact release candidate, and demonstrate owner blindness, consent-off refusal, person-cutout refusal, and friend-only card retrieval before claiming those live flows. Use fictional contacts/messages and owned or licensed assets only.

## License

Project code is licensed under the [MIT License](LICENSE), copyright 2026 Arno Scholtz. Third-party packages, fonts, and assets retain their own licenses and notices; MIT does not relicense them. See the release-hygiene audit for the read-only dependency review.
