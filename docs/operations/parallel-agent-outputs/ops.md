# Ops agent output

**Status: scoped local artifacts complete; Oracle deployment is UNTESTED. External Meta authentication-template approval is unverified and required before OTP is enabled.** No live deployment, purchases, host port changes, or secret-bearing session issuance occurred.

## Owned output

Repository root: `C:/Users/apsch/Documents/personal/gifts-registry`.

- `docs/deployment/docker-compose.oracle.yml`, `Dockerfile.oracle`, `Dockerfile.caddy`, `Caddyfile.example`: standalone candidate, internal-only Postgres, single non-root app, ffmpeg/media volume, optional one-shot migration/policy service, reviewed Cloudflare module build, loopback-only default Caddy publication. Root Compose was not edited.
- `docs/deployment/oracle-vm.md`: prerequisites, release/expand-only policy gates, nightly consistent database+media backups, confirmed empty-target recovery, previous-image recovery, D4 and M-02 integration contracts, and actual validation limitations.
- `docs/deployment/smoke.k6.js`: literal localhost only, one VU, ten iterations, no redirects/model/auth calls; **syntax checked, not executed**.
- `docs/deployment/throttle.vitest.config.ts`: no-secret/no-database runner for the pure helper tests; no shared test configuration was changed here.
- `src/server/auth/throttle.ts` and `tests/routes/throttle.test.ts`: five calls per 60 seconds, retry seconds rounded up, 4096-key/256-code-unit maximum, expired capacity reclamation, fail-closed saturation with no live eviction, invalid input guards. **SINGLE INSTANCE ONLY**, restart resets state.
- `scripts/ops/issue-owner-session.ts`: local-only UUID arguments; verifies real circle ownership and active owner membership under `withActor`; reuses signed cookie helpers. Secure/HttpOnly/Lax, ignored private `.scratch/owner-sessions/` output, mode 0700/0600, exclusive random file creation, stdout is safe path only. No public owner bypass or real identity was committed.
- `scripts/ops/backup.sh`: stopped-writer prerequisite, lock, private atomic publication of custom DB dump+media archive+checksums; successful backups are never auto-deleted.
- `scripts/ops/restore.sh`: trusted private bundle, checksum/archive checks, stopped app, pre-existing empty database and NOLOGIN principals, interactive confirmation, single transaction; **no DROP, --clean, implicit target creation, or migration downgrade**. Media recovery is deliberately operator-controlled into a new volume.

## Actual checks

1. Red: sixth call returned allowed instead of denied. Green after fixed-window implementation.
2. Red: 4097th live key returned allowed. Green after fail-closed bounded storage/reclamation.
3. Red: oversized/empty keys did not throw. Green after key/clock guards.
4. Final throttle run: **4 passed**, public API with injected/default fake time; no DB setup bypass or private state assertions.
5. `bash -n` passed on backup/restore, and Node `--check` passed on the k6 script.
6. Compose structural validation passed with `COMPOSE_DISABLE_ENV_FILE=1`, `config --no-interpolate --no-env-resolution --quiet`. Actual private-env resolution is **not proven**; placeholder-path/content attempts failed. No secret env was printed.
7. Final `tsc --noEmit --incremental false --pretty false`: **passed**. An earlier run showed three errors in parallel `src/server/cards/render.ts` and `tests/cards/render.test.ts`; the other agent's subsequent updates resolved them. Those files were not changed here.
8. Windows issuer invocation with fictional UUIDs returned the generic refusal before reading env/DB or creating a cookie. Positive POSIX issuance and browser import are **untested**.

No full leak suite, Docker build/container startup, Caddy validation, k6 execution, backup/restore drill, DNS/Oracle/WABA check or live Meta request was performed. Caddy CLI, k6, ShellCheck and project-memory MCP were unavailable.

## Parent integration boundaries

- The D4 choice implemented is the SPEC-linked **recording-only operator fallback**, not a public login and not proof of WhatsApp identity. The approved secret wrapper/POSIX invocation bridge is parent-owned and absent here. **Windows is intentionally refused:** Node's mode 0600 is not a Windows ACL guarantee. Run in a private POSIX operator Git checkout, not the shipped app image; it lacks Git metadata. If the recording operator is Windows-only, issuance remains blocked pending an independently reviewed ACL-safe output path or approved POSIX bridge. Private browser cookie import is also parent/operator work.
- Put M-02 before gate DB lookups/session issuance; count successes and failures, return uniform 429/Retry-After. Hash phone identity; require trusted client-address provenance. A phone+address pair alone permits phone rotation, so add an address-only bucket or approved edge budget. **Do not close M-02 on the helper alone.** Never trust arbitrary XFF; direct-client Caddy overwrite rules do not authorize Cloudflare-proxied headers without a configured upstream trust policy.
- Keep exactly one app process/container or replace the limiter with shared atomic state. The Compose candidate is standalone, not an override; reconcile the older architecture “same Compose” wording centrally. Migration command uses direct Node entry points to avoid runtime Corepack network access.
- Supply reviewed ARM64 image digests, VM sizing/approval, HTTPS hostname and ingress approval, DNS-only Cloudflare token/module version, private runtime files, second disk, off-site destination/retention/alerting, and Meta/WABA/template approval. None was invented. Prove non-root ffmpeg/media writes, a recovery drill, and private-input/Caddy validation before deployment.
- No env, package, CI, AGENTS/settings/git config, existing Compose, shared route, or other agent output was edited by this agent. Files remain **uncommitted for parent integration**, as requested; no push was made.
