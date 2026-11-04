# Oracle VM deployment and recovery candidate

**Status: DEPLOYED 2026-10-28 (DEMO_MODE) on the existing shared Oracle ARM VM
(SSH host address: local `docs/private/oracle-host.md` only — gitignored; paths ~/pinata + ~/pinata-private). Single domain: landing page at
https://pinata.scholtz.work/ and the app at https://pinata.scholtz.work/app
(Next PINATA_BASE_PATH=/app), seeded fictional cast (`nadia-30th`). Live
Meta/WhatsApp is NOT enabled: no WABA credentials on the VM and OTP template
approval is still externally gated, so DEMO_MODE=on. Image pinata-app:1.0.0-4b536f6
verified running (app+worker healthy, /app/health 200). Fixes found on the way:
PR #21 (build fixtures), #22 (build env), #23 (migrate egress), #24 (caddy
filecap), #25 (subpath assets), #26 (bare /app).

## Keeping a live fix on the VM (GEO / Caddy matcher)

The checkout’s `origin` is the local bundle `~/pinata/pinata.bundle`, not GitHub.
`vm_deploy.sh` runs `git fetch origin main` then builds `pinata-app:1.0.0-<sha>`.
A dirty overlay on top of an old SHA **does not survive** the next deploy.

After GEO (or any matcher) lands on GitHub `main`:

1. On a clean reviewed machine: `git bundle create pinata.bundle HEAD`
2. Copy the bundle to the VM as `~/pinata/pinata.bundle` (keep the previous file as `.bak`)
3. In `~/pinata/checkout`: `git fetch origin main && git reset --hard origin/main`
4. Run `~/pinata/vm_deploy.sh` (or the same build + `up -d --force-recreate` steps) so the
   running image SHA matches the checkout — do not leave `*-geo` overlay tags as the SoT
5. Caddy `admin off`: recreate the `caddy` service after any `Caddyfile.pinata` change

`@app` must keep `/llms.txt`, `/app/*`, `/card-preview.js`, and `/icons/*` or those paths fall
through to the static site again.

## Artifact contract

Use `docs/deployment/docker-compose.oracle.yml` as a **standalone** Compose file, project `gifts-oracle`, with `--project-directory` set to the repository root. Do not merge it into the root development Compose file: that file publishes a loopback development database port. The architecture's earlier “same Compose file” description needs parent reconciliation; the existing file was not edited here.

**2026-11-01 incident, then the real fix: `POST /app/create` 404 on a live host while `/app` rendered.** First read was a build/runtime mismatch (image built with `PINATA_BASE_PATH=/app`, container running it empty). The real `Caddyfile.pinata` showed the intended contract is single-prefix with **no Next basePath at all** — `/app/*`, `/c/*`, `/lookup`, `/privacy` and assets proxy straight through, unstripped — so basePath support was removed from `next.config.mjs` instead of worked around. Raw `<a>`/`<form>` URLs never get a basePath prefix automatically (only `next/link` does), which is why the doubling only ever broke hand-built URLs. The same pass added the missing `/icons/*` and `/card-preview.js` proxy paths (PWA icons and the gift-card preview script 404d via the site fallback) and a legacy `/app/app/* → /app/*` redirect for doubled links from the 2026-10-28 era. Operator rule going forward: build the image with `PINATA_BASE_PATH` unset or empty (the Dockerfile default is already empty; keep it out of `build_env`), run the container with it empty (the Compose default is empty; `environment:` shadows the env file so a stale shell export still wins), and verify after every redeploy by submitting the hub form once and opening one `/app/open` flow end to end.

- `Dockerfile.oracle`: Node 24, locked pnpm install, generated Prisma client, Next production build, ffmpeg, non-root UID/GID 10001. Explicit copies exclude `.env`, scratch, and local media. Migration tools remain in the v1 image; image-size optimization is not a release prerequisite.
- `Dockerfile.caddy`: Cloudflare DNS module build; a reviewed plugin version/commit is required. Operator must select matching reviewed Caddy builder/runtime versions and immutable release image digests. Default major tags are examples, not reproducible release pins.
- `Caddyfile.example`: DNS-01 TLS, non-root internal HTTPS port 8443, no HTTP listener exposed or access log, no caching layer. Application responses retain their own private/no-store policy. The example assumes **direct clients, Cloudflare DNS-only**, not orange-cloud proxying or a load balancer.
- Database: internal network, named data volume, **no published port**. App: no published port, non-root, read-only root filesystem, writable named media volume and bounded tmpfs caches, dropped capabilities, bounded logs/memory. Caddy alone has a port mapping, defaulting to loopback 8443; public VM 443 binding requires separate explicit operator approval and ingress configuration.
- `migrate` is profile `ops`, one-shot, and never an automatic app startup action. `worker`
  runs the pg-boss ingest consumer (`node --import tsx src/worker.ts`) with the same
  hardening as app (non-root, read-only rootfs, no published ports, named media volume)
  and joins only the internal `database` network. Run exactly one replica: the in-process
  throttle budget resets per process.

## External prerequisites (not supplied)

An approved Oracle account/region, available ARM VM capacity and size, OS/access policy, second backup disk, approved hostname, Cloudflare zone/DNS-scoped token, reviewed image registry/digests, and a private recovery destination are all absent. The example's memory limits are ceilings, **not a validated fit for a particular VM**. Confirm ARM64 image support and disk/memory capacity before a build or deploy.

The WhatsApp prerequisites are also external: WABA and number enrollment, Graph permissions, webhook registration/signature secret, recipient restrictions, model credentials, and **paid authentication-template submission/approval**. Do not invent IDs or treat template submission as approval. There is no unofficial WhatsApp client, payment integration, or public owner bypass in these artifacts.

Secret-bearing operations must go through the existing `Invoke-SecretScript.ps1` boundary and an approved POSIX invocation bridge supplied by the parent. This bridge is **not implemented here**. Do not source secret files in an agent shell, print `docker compose config`, dump container environments, or send credentials to build logs. Inspect failures only through redacted local tooling.

Required Compose inputs:

| Input | Operator supplies |
| --- | --- |
| `APP_IMAGE`, `CADDY_IMAGE`, `POSTGRES_IMAGE` | Reviewed ARM64-capable immutable release references (Postgres 16) |
| `APP_RUNTIME_ENV_FILE` | Absolute, out-of-repo private env file; `DATABASE_URL` points to `postgres:5432`; signing/model/WhatsApp values supplied by the secret wrapper |
| `CADDY_RUNTIME_ENV_FILE` | Absolute private file containing `CIRCLE_HOST` and DNS-only `CLOUDFLARE_API_TOKEN` |
| `POSTGRES_PASSWORD_FILE` | Absolute private password file, consistent with the application's database URL |
| `POSTGRES_USER`, `POSTGRES_DB` | Matching database identifiers; local defaults are `gifts` |
| `HTTPS_BIND_IP`, `HTTPS_PORT` | Loopback/8443 defaults; public bind/443 only on the approved VM |
| `BACKUP_DIR` | Existing absolute external directory on the backup disk, owned by the job user, mode 0700 |

Keep runtime files and backups outside Git, restrict them to the operator, and ensure the Docker daemon can read the password secret. Compose local secrets are bind-mounted files, **not an encrypted vault**. Use an HTTPS `CIRCLE_BASE_URL` matching `CIRCLE_HOST`; choose `DEMO_MODE` explicitly. Model keys remain runtime-only. Check the current `src/lib/env.ts` at integration time rather than adding another environment contract here.

## Build, release, and health gates

1. In a clean reviewed release checkout, run typecheck and the full leak suite against an isolated test database. Scan the public diff for secrets/real identities. On a Windows `Documents` checkout, use the installed `gdrive-reparse` skill before any Docker build. No build was run in this task.
2. Build ARM64 images from the repository-root context with these Dockerfiles. The app build requires BuildKit secret `build_env`: an **out-of-repo disposable build-only env file** with local placeholder database/origin and a randomly generated temporary signing value, never production credentials. Do not pass secrets as build arguments. Review source for new public build-time env variables before proceeding. Inspect/scan the resulting image and prove UID 10001, ffmpeg execution, media volume ownership/writability and cache writes on staging.
3. Validate Compose privately with actual private inputs and validate Caddy with the reviewed plugin image. `caddy validate` may provision DNS modules; keep its output redacted. Confirm no database/app host publication and no stale pre-existing permissive Oracle ingress rules.
4. Save the previous image digests and matching non-secret release configuration privately. For an existing deployment, stop **all writers**, then take the database+media backup below. Initial deployment has no prior app container to back up; record that fact rather than claiming a recovery point.
5. Start only Postgres. Manually run the new image's `migrate` one-shot service: Prisma migrate deploy with `--config prisma7.config.ts`, then `pnpm db:policies`. Review every migration as **expand-only**: no drop/rename/narrowing or incompatible constraint. Test the previous image against the expanded schema in staging. No automated Prisma downgrade, migrate reset, or destructive cleanup is permitted.
6. Start the single app container; `/health` must return 200 with the policy check passing. Then start Caddy, verify real HTTPS/DNS and `/c/<slug>` stability, and run the owner/friend privacy checks. A missing policy is a failed release, not a reason to bypass health. A 200 alone does not replace leak tests. Do not expose `/health` response details as a public monitoring dashboard.
7. The in-process throttle permits **one app process/container only**. This procedure has a maintenance window; it does not promise rolling/zero-downtime deployment. Freeze changes after November 3 per the repo policy; availability during judging is not yet proven.

## Nightly backup

`scripts/ops/backup.sh` is a Linux candidate, not an installed scheduler. Invoke it with `bash` through the parent-supplied secret wrapper. It refuses a running `app` or `worker`, takes an advisory lock, writes a custom `pg_dump`, checks the archive table of contents, copies the stopped app's media and archives it **without following symlinks**, then publishes one private directory containing `database.dump`, `media.tar`, and `SHA256SUMS`. Partial bundles are removed on failure; successful backups are not automatically deleted. Standard output contains only the bundle path.

Configure an operator-owned nightly job (for example `15 3 * * *` **after confirming the host timezone**). Its secret-wrapped sequence must:

1. Stop all app/worker writers and wait for in-flight work; keep the stopped app container so `compose cp` can read media. Postgres stays up.
2. Invoke `backup.sh` with the approved Compose inputs and `BACKUP_DIR`.
3. Restart the **unchanged** application after the backup attempt and check health; report backup failure separately. Do not recreate/update services or run migrations in the backup job.
4. Copy the bundle to a private encrypted off-VM destination and alert on failure using an operator-configured channel. Destination, retention, and alert credentials are absent; scheduling and off-site recovery are **unverified prerequisites**, not working integrations.

A second disk protects against one disk failure, not VM/account loss. A daily backup implies at best a 24-hour recovery-point objective, only once successful scheduling and off-site copies are verified. Archive checksums prove transport integrity, not that restoration works. Retain previous known-good bundles until a drill has passed. Backups contain personal and friend-hidden ledger/media data: never commit them or print their contents.

## Confirmed recovery, never an automatic destructive rollback

1. Obtain operator confirmation, stop all writers/traffic, preserve the current data/volumes and take a fresh forensic backup. Select a **trusted** previous bundle plus the previous matching image/configuration. A dump can execute SQL; never restore an untrusted archive.
2. Provision an explicitly named **empty** recovery database on Postgres 16 through the approved operator workflow. On a fresh cluster, provision the existing NOLOGIN `app_owned` and `app_friend` principals before restoring; cluster roles/passwords are not in `pg_dump`. Do not drop or clear the live database.
3. Run `scripts/ops/restore.sh <absolute-bundle-directory> <empty-database-name>`. The script checks bundle privacy/checksums, stopped app, empty relations and role presence, validates the archive, then requires interactive `RESTORE <target>` confirmation on the local terminal. Without a TTY/confirmation it refuses. It uses one transaction with `--exit-on-error --no-owner --no-acl`, **never** `--clean`, DROP DATABASE, or implicit database creation. Stdout contains no restored data.
4. Keep the app stopped. Restore `media.tar` into a **new empty media volume** under operator control: inspect archive entry paths, reject absolute/traversal paths and unsafe symlinks, and set UID/GID 10001 before attaching it. This is intentionally not automated by the database script; it never overwrites live media. Use the preserved previous volumes if doing an image-only rollback.
5. Reapply policies/grants from the **matching previous release** to the recovery database because ACLs were deliberately excluded from the dump. Check coverage and run the leak suite against an isolated copy of the recovery data using secret-aware tooling. Do not seed over recovered data.
6. Point the previous image and private runtime configuration at the recovered database/new media volume, verify health and role projections, then switch traffic explicitly. If an image-only rollback is sufficient, keep the expanded schema and redeploy the previous image without running migration downgrade commands. Preserve the newer data for reconciliation; never auto-delete it.

Restoration, media rebinding, scheduled backups, RLS reapplication on recovery, and previous-image compatibility all need an actual isolated drill before production use.

## Owner session: D4 recording-only choice

`scripts/ops/issue-owner-session.ts <circle-uuid> <owner-user-uuid>` implements the documented local operator fallback. The parent still owns the final SPEC/plan reconciliation. The script:

- Has no HTTP route and accepts UUIDs only, never a phone/BSUID or arbitrary role.
- Uses `withActor` and the real database to verify the circle's owner plus an active owner membership; no identity/membership row is created.
- Reuses `issueSession`, `readSession`, and `sessionCookie`: owner role, existing 14-day expiry, HttpOnly, SameSite=Lax, Secure. Requires production mode and HTTPS configuration.
- Requires a **private POSIX Linux checkout**, Git and the parent-supplied secret wrapper. It checks Git ignores the output, rejects symlink/non-private directories, and writes exclusively under `.scratch/owner-sessions/` with directory mode 0700 and file mode 0600. No credential is written on Windows: Node POSIX modes cannot establish a restrictive Windows ACL. Windows issuance remains blocked until an independently reviewed ACL-safe output path or approved POSIX operator bridge exists.
- Prints only a random local cookie-file path and a generic failure. The file is a bearer credential containing a `Set-Cookie` header, **not** a public link, endpoint, or automatically delivered cookie. A trusted operator must privately import it into the recording profile before taking the demo, avoid screenshots/clipboard logs, and delete it afterward. No browser import helper was added.

Do not run this script in the shipped app container: it deliberately lacks a Git checkout/ignore metadata. Do not turn this tool into a production self-service owner login. D4's verified WhatsApp BSUID path remains the proper future door; authentication-template approval is still external.

## M-02 throttle integration boundary

`checkGateThrottle(key, now?)` allows five calls per 60-second fixed window; denied calls return rounded-up `Retry-After` seconds and do not extend the window. At most 4096 keys of 256 UTF-16 code units are retained. Saturation denies new keys until an existing window expires, rather than evicting live attacker limits. Empty/oversized keys and invalid millisecond clocks throw before storage.

**SINGLE INSTANCE ONLY.** Restart resets state; multiple Node workers/containers/serverless instances each have their own budget. No synchronous file locking or schema change was introduced to preserve this pure, synchronous API; multi-instance use requires a separately designed shared atomic limiter.

The parent must put the guard before gate lookups/session issuance, count successful and failed attempts equally, and return a uniform 429 plus `Retry-After` without echoing identity or membership. Keep keys hashed/pseudonymous: combine normalized keyed phone hash with a **trusted** source address, not a raw number. A pair-only key does **not** stop one address rotating guessed numbers: also apply a source-address bucket or approved edge limit. Do not mark M-02 closed based on the helper alone.

Never trust request-supplied `X-Forwarded-For`, `Forwarded`, or `X-Real-IP` without configured proxy provenance. The Caddy example overwrites/removes these and app has no public port, but the route adapter still needs an explicit trusted-proxy contract. If Cloudflare proxying is enabled later, Caddy's peer is Cloudflare: the direct-client example is no longer the right identity source. Validate the upstream proxy ranges/header overwrite policy first, or reject/fail closed; do not accept arbitrary client claims as IPs. A trusted proxy/address configuration was not added to shared env/routes in this task.

## Local checks actually performed

- Throttle: observed red for the sixth attempt, red for the 4097th live key, red for invalid/oversized input; then **4 public-seam tests passed** with fake time/default-clock coverage.
- `bash -n` passed for backup/restore; Node syntax check passed for `smoke.k6.js`.
- Compose **structural** validation passed with `COMPOSE_DISABLE_ENV_FILE=1` and `config --no-interpolate --no-env-resolution --quiet`. Full private-input resolution is untested; attempting it with non-env placeholder files correctly failed rather than proving valid runtime configuration.
- Windows owner issuer returned a generic failure before env/database access. Positive Linux issuance, filesystem/DB success and browser import remain untested.
- Final repository typecheck passed (`tsc --noEmit --incremental false`). An earlier run reported three parallel card-rendering errors; those disappeared after the other agent's updates, without edits here.
- Caddy CLI, k6 and ShellCheck were unavailable. No Caddy module validation, Docker build, runtime image check, backup/restore drill, k6 execution, external request/load, or live deployment was performed.

The pure helper can be checked without DB secrets using `pnpm exec vitest run --config docs/deployment/throttle.vitest.config.ts`. The bounded local smoke is `k6 run docs/deployment/smoke.k6.js`: one VU, ten iterations maximum, 30-second ceiling, literal `http://127.0.0.1:3000/health` only, redirects disabled. It performs no login/model calls and is not a throughput benchmark. The Oracle Compose file does not publish app port 3000; run smoke against the local development app, not by opening another VM port.
