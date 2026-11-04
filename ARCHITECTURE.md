# Architecture Overview
This document serves as a critical, living template designed to equip agents with a rapid and comprehensive understanding of the codebase's architecture, enabling efficient navigation and effective contribution from day one. Update this document as the codebase evolves.

Verified local structure as of **2026-10-27**. This map distinguishes local implementation from unverified live services and deployment.

## 1. Project Structure
This section provides a high-level overview of the project's directory and file structure, categorised by architectural layer or major functional area. It is essential for quickly navigating the codebase, locating relevant files, and understanding the overall organization and separation of concerns.

```text
gifts-registry/
  AGENTS.md CLAUDE.md ARCHITECTURE.md MISTAKES.md WISHLIST.md SPEC.md DESIGN.md
  README.md LICENSE
  package.json pnpm-lock.yaml prisma7.config.ts
  next.config.mjs vitest.config.ts playwright.config.ts
  docker-compose.yml        # Local PostgreSQL only, loopback port 5433
  prisma/                   # Schema and migrations; policies deployed separately
  src/
    app/                    # Landing, /app invite entry, /health, icons
      c/[slug]/             # Stable GET/POST and private catch-all route adapters
      api/wa/webhook/        # Node raw-body webhook GET/POST
    components/             # Hook-free shared UI and seven screens plus landing
    lib/                    # Validated environment and integer-money formatting
    server/
      db/                   # Actor transaction wrapper and checked-in policy SQL
      auth/                 # Signed cookies, phone hashing, unmounted throttle helper
      routes/               # Framework-free circle HTTP, native actions and private HTML
      views/                # Explicit owner/friend projections
      entitlements.ts       # Actor-private capability decisions
      wa/                   # Signature, identity, queue, bounded media/HTTP/storage
      models/               # Consent-gated Meta client and explicit fixture mode
      intake/               # Voice/link/image drafts, checkpoints and processing
      ledger/               # Scoped transactional item/claim/pool/contribution functions
      agent/                # Six deterministic task intents, dispatch and private status
      cards/                # Contributor validation/projection, Satori and resvg PNG
      vision/               # Person/mask guard, bounded compositing and atomic publication
    worker.ts               # pg-boss ingest consumer and shutdown lifecycle
    generated/prisma/       # Generated and ignored
  public/                   # Private-route stylesheet, share-link.js, optional card-preview JS, brand assets
  site/                     # gifts.scholtz.work: static Pages site + contact Function (wrangler direct upload)
  tests/                    # RLS/views/routes, backend, screens and Chromium browser flows
    fixtures/               # Fictional WhatsApp/model and synthetic vision inputs
  scripts/                  # Policy application and fictional seed
    ops/                    # Plans registry, KB sync, owner issuer, backup/restore sources
  docs/
    deployment/             # Unexecuted Oracle/Caddy/Compose/k6 candidates
    operations/parallel-agent-outputs/ # Worker reports and parent verification addenda
    plans/                  # Git-native work queue and generated index
  .github/workflows/        # Existing workflow sources; execution not certified here
```

**Ecosystem:** [AGENTS.md](AGENTS.md) governs behavior; [SPEC.md](SPEC.md) defines product requirements; [DESIGN.md](DESIGN.md) defines the Paper Fiesta tokens and the UI rules agents must pass; [MISTAKES.md](MISTAKES.md) and [WISHLIST.md](WISHLIST.md) record incidents and tooling gaps. Work status is in [docs/plans/PLANS_INDEX.md](docs/plans/PLANS_INDEX.md); integration evidence is in [parallel-build-closeout](docs/plans/parallel-build-closeout.md). No generated graph is needed to use this map.

## 2. High-Level System Diagram
Provide a simple block diagram (e.g., a C4 Model Level 1: System Context diagram, or a basic component diagram) or a clear text-based description of the major components and their interactions. Focus on how data flows, services communicate, and key architectural boundaries.

```text
Browser -> Next Node adapters -> circle HTTP role checks -> owner/friend projections
                                      |                           |
                                  native POST                withActor + RLS
                                      |                           |
                                  ledger/cards <-------------- Postgres

Signed webhook -> raw HMAC -> current identity -> event + pg-boss job transaction
                                                     |
                                           immediate media acquisition
                                                     |
Worker -> session advisory lock -> staged intake -> private version-1 draft
                                      |
                           short actor consent transactions
                                      |
                     bounded external adapters OR explicit demo fixtures

Human draft confirmation -> one scoped item, exactly once
Eligible friend -> own card entry -> private PNG -> manual human handover
Vision service factory -> person guard -> mask/composite -> atomic private file
```

The webhook acknowledgement is **not an outgoing WhatsApp message**. Live media/model adapters exist but have only external-fake/fixture evidence. The vision factory is separate from screenshot intake and refuses unsupported live SAM. Oracle deployment and outbound transport are not represented as running services.

## 3. Core Components
(List and briefly describe the main components of the system. For each, include its primary responsibility and key technologies used.)

### 3.1. Frontend

**Piñata web UI:** Next.js App Router serves the public landing/invite entry and stable `/c/<slug>` routes. Paper Fiesta (light-only cream paper, ink-outlined cards) uses local Bricolage Grotesque and DM Sans fonts; `public/pinata.css` is the one stylesheet and `src/components/status.ts` owns the friend status wording. Seven private/entry screens cover join, owner ledger, friend ledger, item detail, draft confirmation, card composition and capability settings. Shell footers use `SiteBuiltBy` (`src/components/site-built-by.tsx`); generative-engine summary is `GET /llms.txt` (`src/app/llms.txt/route.ts`, FAQ source `src/lib/site-faqs.ts`), with the marketing twin at `site/public/llms.txt`.

The circle side menu (`src/components/screens/circle-menu.tsx`) lists wishes or gifts, then the signed-in person's circles. That layout follows Sharewear's drawer. Sharewear is Flutter and has no `src/` tree: `lib/widgets/app_drawer.dart` is the Items row, and `lib/widgets/drawer_wardrobes_section.dart` is the closet list. Private routes return raw server-rendered HTML with native forms. The Node renderer loads `react-dom/server` through `createRequire(import.meta.url)` because Next's `react-server` export conditions reject the ordinary import in an App Route. Components have no hooks; every Field caller supplies a unique explicit ID. Card preview JavaScript is optional, and anonymous save works without it.

### 3.2. Backend Services

| Component | Responsibility and constraint |
| --- | --- |
| `routes/circle.ts` | Resolve current actor/circle, branch explicitly on actual ownership, render private projections, bound native form bodies and verify canonical same-origin POSTs. |
| `db/client.ts` | `withActor` switches to `app_owned`/`app_friend`, sets transaction-local actor/circle/optional phone context and asserts the role. Prisma queries use a ten-connection pool. Long ingest session locks use a separate two-connection pool; acquisitions have five-second timeouts. |
| `entitlements.ts` | One actor-private spending gate. User choices prevail despite inherited expiry; user toggles clear expiry. Expired non-user grants fall back to the plan; outages fail closed. |
| `wa` / `intake` | Raw HMAC before parsing, unique-message dedupe, atomic event/job commit, immediate bounded media acquisition, no-shell Ogg/Opus conversion, staged private candidates and checkpoints. |
| `models` | Recheck current membership/ownership and capability before each spending stage. ASR is `muse-voice-transcribe-1.0`; structured extraction is `muse-spark-1.2`. Missing credentials or live failures never enable fixtures. |
| `ledger` | Canonical UUID item advisory transaction lock precedes pool-row locks. Claim/release/open-pool/contribute/mark-paid and human confirmation are exercised on real PostgreSQL. Multi-user purchase, owner creation and tombstone/pivot still refuse unsupported operations. |
| `agent` | Exactly six task intents. Free text and model output cannot select state transitions. Owner status excludes friend coordination; replies need a separate outgoing transport. |
| `cards` | Eligibility and own-entry updates, literal messages, URL rejection in names/messages, supported-glyph validation, bounded layout and Satori/resvg PNG. Owners and non-givers receive generic private 404s. |
| `vision` | Person-box check before mask persistence, excluded-pixel zeroing, consent checks, bounded decoding and atomic completed-file publication. Synthetic guard/compositor tests do not certify live detection accuracy. |
| `src/worker.ts` | Start/poll/complete pg-boss jobs and return an async shutdown closure; `pnpm worker` launches the local process. Container worker integration remains open. |

## 4. Data Stores
(List and describe the databases and other persistent storage solutions used.)

### 4.1. PostgreSQL 16

One system of record, accessed through Prisma 7's PostgreSQL adapter and `pg`. The seventeen Prisma application tables are: `users`, `entitlements`, `attributes`, `circles`, `allowlist_entries`, `memberships`, `items`, `registry_items`, `circle_item_links`, `claims`, `pools`, `contributions`, `ingest_events`, `ledger_events`, `card_entries`, `gift_cards`, `otp_codes`. Prisma bookkeeping and pg-boss queue tables are separate infrastructure state.

Amounts are integer minor units with explicit ZAR currency. Unknown item prices are null; contributions and pool targets must be positive. Settlement is manual and no money is held. Billing decisions are recorded in [user-management-and-billing-path](docs/plans/user-management-and-billing-path.md); no payment integration is required before submission.

`users.phone_e164` and `users.email` are plaintext on purpose: the login role needs the value to match a webhook or to send a sign-in code. Lookup hashes are separate (`email_hash` is HMAC-SHA256 of `email:` + the normalised address, pepper `PHONE_HASH_PEPPER`). Allowlist phones and proxy recipient phones stay keyed hashes only. App roles are not granted `phone_e164`, `bsuid`, `email`, or `email_hash` (`src/server/db/policies/001_roles.sql`). `circles.discoverable` (default false) is stored and is not on the create form. Owner sign-in does not read it: "Open my circle" sends a code for any active circle with an email, and other people open `/c/<slug>`. Sign-in codes live in `otp_codes`, keyed by `identifier_hash`.

Policy SQL is applied separately after migrations. RLS scopes rows; safe-column grants on `users` protect phone, email, and BSUID columns. `app.user_id` and `app.circle_id` are transaction-local settings; there is no `app.role` authorization setting. Friend-circle predicates exclude the actual owner, require active membership/circle and bind to the actor's selected circle. Owner ledger-event reads are limited to the owner's own events. Card entries are writable only by their contributor.

RLS cannot express a column that some roles may see and others may not, so column secrecy is decided in the projection builder and proved against the rendered HTML. `circles.event_date` is the first case: the owner sees it only when they wrote it, which is `ownerCircleView` plus a leak test, not a policy ([two dates and the countdown](docs/plans/birthday-and-event-countdown.md)). Writes that a role has no policy for go through a narrow `SECURITY DEFINER` function — `app_set_event_date(date)` takes a date and nothing else, because a friend UPDATE policy on `circles` would also permit renaming the circle or moving `share_slug`.

Migrations are hand-written expand-only SQL. Prisma 7.10.1 dropped `migrate diff --shadow-database-url`, so drift is checked against the live dev database: `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` must print an empty migration. `CHECK` constraints exist only in migration SQL — 7.10.1 does not introspect them, so a future `migrate dev` may propose dropping them.

### 4.2. Private Files and Queue

`MEDIA_DIR/ingest` holds promptly acquired media using validated database UUID filenames and private atomic writes. Vision outputs also publish completed temporary files atomically. Application-controlled storage is required; crash recovery, hostile-local-filesystem behavior and scheduled media expiry cleanup are not certified.

`ingest_events.draft` holds a version-1 private record with input, transcript/evidence, reply and one pending candidate. Human confirmation uses actor ownership/current circle and corrected values; provenance `actorRole` is not authorization. pg-boss persists jobs in PostgreSQL, with event and job committed together.

## 5. External Integrations / APIs
(List any third-party services or external APIs the system interacts with.)

| Integration | Implemented boundary | Evidence gap |
| --- | --- | --- |
| WhatsApp Cloud API | Challenge/raw signature, BSUID-first resolution, bounded metadata/media downloads and seven-day media lifetime metadata. | No live WABA/number/webhook/device run or outbound message transport. The independent MIT `whatsapp-api-js` wrapper was reviewed, not installed. |
| Meta Model API | Pinned endpoint/models, WAV ASR, flat constrained JSON, local validation and per-stage consent. | No paid/live request; external-fake and explicit demo-fixture tests only. |
| Retailer metadata | Exact allowlisted HTTPS hosts, redirects refused, bounded metadata/lexical money parsing. | No arbitrary marketplace scraping, retailer image download or live quality benchmark. |
| Person/SAM service | Injection seam and conservative person/mask guard. | Unsupported live SAM refuses; not wired to multi-candidate screenshot intake. |
| Cloudflare/Caddy | DNS-01 and private-network deployment templates. | No authorized VM/domain/token or TLS deployment verification. |
| Resend (email OTP) | `src/server/otp/deliver.ts` posts a plain sign-in code when `DEMO_MODE=off` and both `RESEND_API_KEY` and `OTP_FROM_EMAIL` are set. Vault item `RESEND_API_KEY` is `repo=shared`, `env=single`. The marketing site's contact function is a separate caller. | No verified From address is chosen. `DEMO_MODE=on` logs the code and does not send. |

Authentication OTP is email, not a WhatsApp template. See [otp-return-path](docs/plans/otp-return-path.md). Fixed-menu interactive messages require the service window; outside it approved templates are necessary. No unofficial WhatsApp clients, general chatbot, Marketplace scraping or automatic card/reveal delivery are allowed.

## 6. Deployment & Infrastructure

**Local:** Windows x64, Node 24 and pnpm 10.33.0; root Compose starts PostgreSQL only on `127.0.0.1:5433`. The app and worker run separately. Browser tests own a loopback server on port 3001 and an isolated test database.

**Live host (checked 2026-11-04):** shared Oracle VM (SSH as `ubuntu`; **host address lives only in gitignored** [`docs/private/oracle-host.md`](docs/private/oracle-host.md) and Notion via `/doc-kb-save` — never commit the IP), checkout `~/pinata/checkout`, private env `~/pinata-private/app.env` (never print it). Running app image is the tag on `checkout-app-1`; after the GEO redeploy that day it was `pinata-app:1.0.0-2d68d40-geo` (base `2d68d40` plus footer/`/llms.txt` overlay; still behind local `main`). Caddyfile is bind-mounted from `docs/deployment/Caddyfile.pinata` and `@app` includes `/llms.txt` so that path hits Next, not the static site. Caddy `admin off`, so a matcher edit needs the caddy service recreated, not `caddy reload`. The `@app` matcher must include `/app/*` or `POST /app/create` 404s on the static site while `/app` still returns 200. A new file in `public/` (such as `share-link.js`) 404s on that same static site until its filename is added to the `@app` list. Steps: [oracle-vm.md](docs/deployment/oracle-vm.md). Backup/restore is still an undrilled candidate. GitHub visibility is **public** (`scholtzap/gift-registry`); re-check with gitleaks + the `+27` gate before any push that adds env, media, or demos — evidence: [public-repo-safety](docs/investigations/2026-11-04-public-repo-safety.md).

The exact local production build passed Chromium routes with installed dependencies. Its circle traces contain Geist, sharp and resvg; the dynamic React renderer require is not listed in those traces. The Oracle candidate copies full dependencies. Minimal standalone deployment, ARM64 native bindings, container worker lifecycle and FFmpeg binary behavior still need verification. Materialize Google Drive reparse-sensitive files before Docker builds.

Migrations must remain expand-only. Recovery requires a previous image tag and a verified database restore; never automatically roll back a production migration. Existing CI/doc-sync sources are not evidence of a successful CI run. CI owns KB publication; this work did not publish documents manually.

**CI quickref:** this repo is public (free Linux minutes). Historically, while it was still private, a GitHub Actions job that failed in ~4 s with zero steps and no log meant Actions minutes/billing, not YAML — the reason lived in the check-run annotation, not `--log-failed`. Do not debug the workflow file for that pattern.

## 7. Security Considerations

- Actual ownership and active membership are checked at HTTP/model boundaries; a signed cookie role alone is insufficient. Keep the explicit owner branch and friend-owner exclusion.
- All private HTML, errors, redirects and PNG responses use `private, no-store, max-age=0, must-revalidate`. Missing and unauthorized resources are indistinguishable 404s. Cards have no OG/Twitter preview, automatic notification or delivery.
- Cookies are signed, HttpOnly, SameSite=Lax and Secure in production. The current phone allowlist gate is not possession verification. Email OTP (`/app/find`, `/app/verify`) is the sign-in path for a discoverable circle; live Resend sending waits on `OTP_FROM_EMAIL`. See [otp-return-path](docs/plans/otp-return-path.md).
- Native POSTs compare Origin/Referer with configured `CIRCLE_BASE_URL`, not internal Next hostnames or untrusted forwarded headers. Private Referrer-Policy is `same-origin`; foreign/null origins remain denied. Form bodies are bounded to 16 KiB.
- Raw webhook HMAC precedes JSON parsing. External media/model/retailer requests have host/protocol, redirect, byte and timeout bounds; FFmpeg receives fixed argv with `shell: false`.
- User/model text is data. Only strict explicit task intents select transitions. Every model-spending stage rechecks consent; user opt-outs do not expire with inherited grants.
- Session advisory locks use their own bounded pool so callbacks retain query capacity. Failed unlock discards the session rather than recycling a potentially lock-bearing connection.
- Literal contributor messages are preserved. URLs and unsupported glyphs refuse with recoverable UI instead of silently changing or losing words. No person pixels may be published by the vision factory.
- `.env`, credentials, runtime media and caches stay ignored. Use fictional fixtures and secret-safe, redacted scans; a zero scan does not certify personal-data publication or third-party asset rights.
- The M-02 gate throttle is mounted in `routes/circle.ts`: every gate attempt (success or failure) counts against circle + phone-hash + forwarded-address at 5/min before the allowlist lookup, with a uniform 429 + `Retry-After`; it is single-process in-memory state, so a second app process would double the budget. The Windows-positive owner credential flow is not verified. See [ops report](docs/operations/parallel-agent-outputs/ops.md).

Review evidence is in [security_best_practices_report.md](security_best_practices_report.md), [cards/vision review](docs/operations/parallel-agent-outputs/security-cards-vision.md) and [intake report](docs/operations/parallel-agent-outputs/intake.md). New local security regressions reproduced pool starvation and inherited-expiry opt-out failure before both fixes; all 24 focused PostgreSQL consent/intake cases subsequently passed.

## 8. Development & Testing Environment

See [README.md](README.md) and [AGENTS.md](AGENTS.md) for configuration/commands. Prisma scripts and test setup explicitly use `prisma7.config.ts`; policy application is a separate step. Generated client and local secrets must not be committed.

`pnpm test` runs serial Vitest files against `DATABASE_URL_TEST`, applying migrations and reviewed policies. `pnpm leak` selects leak/views/entitlements/routes. Use an isolated disposable test database/account, never valuable data. Do not disable RLS or drop databases merely to demonstrate a red.

`pnpm test:browser` starts Next dev on loopback and exercises mounted HTTP/navigation/native writes with fictional scoped sessions. `PLAYWRIGHT_PRODUCTION=1` uses a previously built production artifact; `NEXT_DIST_DIR=.next-verification pnpm build` selects its isolated build directory. Browser setup signs fixture sessions directly and is not OTP evidence.

Final local verification: **393/393 Vitest cases across 34 files**, typecheck, production build and **10/10 production Chromium cases passed**. The four new security regressions failed before their fixes and passed in a 24-case focused PostgreSQL run. Full evidence is recorded in [closeout](docs/plans/parallel-build-closeout.md). Browser coverage includes webhook challenge/signature, owner reflow, private drafts, claim/release/pool/paid, settings, card preview/save/download, no-JS anonymity and owner/forged-friend exclusion.

No real human usability trials, screen-reader sessions, axe conformance result, physical WhatsApp browser test or k6 runtime result is claimed. Public landing accessibility measurements and an eight-task human script are in [accessibility-and-click-tests](docs/operations/parallel-agent-outputs/accessibility-and-click-tests.md).

## 9. Future Considerations / Roadmap

The existing [parallel closeout](docs/plans/parallel-build-closeout.md) owns unfinished work: multi-user purchase, circle creation, owner tombstone/pivot, live SAM and vision/intake binding, mounted throttling, owner session/OTP, outgoing transport, live Meta evidence and Oracle deployment/restore/ARM64 checks. Humanizer changes await per-item approval and never alter contributors' messages.

Deferred research is in [deferred-spikes](docs/strategy/investigations/deferred-spikes.md). PayFast is the planned ZA gateway after the hackathon; recurring payments are credit-card only and it is not a merchant of record. There is no Stripe/escrow implementation. Post-event reveal and deal discovery remain planned; no Marketplace access is implied.

## 10. Project Identification

Project Name: Piñata (`pinata` package), Gift Circles.

Repository: `scholtzap/gift-registry` (**public** as of the 2026-11-04 safety check). Visibility changes still need explicit operator approval. Public-tree hygiene evidence: [public-repo-safety](docs/investigations/2026-11-04-public-repo-safety.md) — gitleaks clean, no `+27` phones, `.env` never tracked; does not certify the live VM or unpushed local work.

Primary Contact: Arno Scholtz. Meta Global AI Developer Hackathon, Indie Developer track; submission deadline **2026-11-04 21:00 ET**.

Date of Last Update: **2026-11-04**.

## 11. Glossary / Acronyms

- **Circle:** one gift recipient, occasion, stable gated link and allowlisted members.
- **Owner:** the gift recipient; must not discover friend gift coordination through any app surface.
- **Projection:** an explicitly scoped rendering of the shared ledger, not a separate database.
- **BSUID:** Business-Scoped User ID, the preferred WhatsApp identity when supplied.
- **RLS:** PostgreSQL Row-Level Security; safe-column grants additionally protect identity fields.
- **Pool:** contributors promise/pay manually behind one assigned buyer.
- **Pivot:** planned reassignment after an owner tombstones a wish; not completed here.
- **Candidate:** actor-private, unconfirmed model/metadata draft requiring human review.
- **Demo fixture:** explicitly selected fictional output with recorded demo provenance, not live inference.
- **Reveal:** a human handover of the card; never an automatic send or public preview.
