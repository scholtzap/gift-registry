---
title: Release hygiene evidence
type: audit
status: draft
updated: 2026-10-27
---

# Release hygiene evidence

## Scope and verdict

Owned files: `.gitignore`, `README.md`, `LICENSE`, and this report only. MIT was explicitly approved; copyright is **2026 Arno Scholtz**. No source, dependency, deployment, hook, Git configuration, or permission-setting changes were made by this pass. No staging, branch operation, commit, push, visibility change, third-party installation, secret extraction, or outside upload was performed. Other agents' changes remain untouched.

**Verdict: scoped hygiene checks passed; public-release readiness is not certified.** Historical private-account URL identifiers still need review, and integrated runtime/privacy/live-provider checks were not run. Incoming worker files are not certified complete merely because they now exist.

## Checks actually performed

| Check | Evidence / redacted result |
|---|---|
| Required context | Read `ARCHITECTURE.md` §§1–3, existing `.gitignore`, and installed `repo-hygiene`, `secrets-management`, `codebase-audit-pre-push`, `readme`, and `dependency-upgrade` skill instructions; root README/LICENSE/report did not previously exist |
| Read-only Git inventory | Initial `git status --short`, unstaged/staged diff statistics, `git ls-files`, and reachable-commit inventory; initial tree was clean, then other agents began concurrent changes |
| Scanner availability | Existing executable at `C:/Users/apsch/AppData/Local/Microsoft/WinGet/Links/gitleaks`; `gitleaks version` returned **8.30.1**; no installation needed |
| Full reachable Git history | Gitleaks `git --log-opts=--all`, default rules explicitly extended, `--ignore-gitleaks-allow`, no ignore/baseline file, `--redact=100`; **exit 0, zero findings**, 26 reachable commits at `b8c6532e6533700e234b41cbd6014baee1854423` |
| Tracked working content | Gitleaks `dir` against an outside-repo snapshot of **103 tracked paths**, including tracked dirty content available at capture; **exit 0, zero findings**, zero omitted paths |
| South African phone literals | Separate location-only checks of tracked snapshot and every reachable commit for contiguous and space/parenthesis/hyphen-separated `+27` numbers; **zero matches**. Gitleaks alone is not a phone-number check |
| Private-account URLs | Location-only history/working checks; two historical identifier-bearing document locations require review (below). Current checklist match is a search pattern, not an account identifier |
| Email locations | Separate tracked-file scan emitted locations/categories only; **zero email-literal locations** at time of check. Git author metadata is outside this content scan and the approved copyright author is permitted |
| Ignore protection matrix | `git check-ignore --no-index` evaluated **42 cases, zero failures**: private env/credentials/runtime media/caches ignored; env templates, migrations, policy SQL, fixtures, deployment manifests, icons/design assets/shared editor config preserved |
| Tracked ignored paths | `git ls-files -ci --exclude-standard`: **zero**. Ignore edits did not silently hide already tracked files |
| Environment handling | Local `.env` and variant values were not opened. `.env.example` was inventoried as key names only; Gitleaks scanned the tracked template without displaying values. No provider credential was retrieved or exercised |
| Hook discovery | Read-only `git config --show-origin --get core.hooksPath` points to the existing global `~/.config/git/hooks`; repository `.githooks/pre-commit` is a plans-index hook. No hook was invoked/installed/changed; effective hook-chain enforcement remains the tooling owner's check |
| Dependency research | Public npm registry GET metadata plus public upstream source fetched with `gh api`; no npm install, audit upload, package execution, lockfile edit, or automatic upgrade |
| Runtime/build tests | **Not run**: typecheck, Vitest/leak suite, browser tests, build, DB migrations/policies/seeding, Docker, webhook/device/provider smoke tests. Scope is documentation and release hygiene; no private runtime was initialized |
| Post-edit candidate scan | Final history and **106-path candidate snapshot** (103 tracked paths plus the three new owned documents): both Gitleaks **exit 0, zero findings**, zero skipped paths; separate candidate phone check **zero matches**. Seven local Markdown links, LF/trailing-whitespace checks, and audit frontmatter validation passed; scoped `git diff --check` passed. HEAD remained the same 26-commit snapshot |

The Git history scan covers local reachable refs, not remote-only branches, forks, GitHub caches, reflogs, unreachable objects, LFS payloads, or binary/archive data outside the scanner's defaults. The working snapshot excludes untracked incoming modules: the final candidate includes only tracked paths plus this worker's four owned files. A zero-finding scan is not proof of absence of secrets or permission to publish personal data.

## Historical privacy locations — values deliberately omitted

- `docs/_archive/Gift Wishlist App Competitor Analysis (original gemini export).md:3` — historical private-account URL identifier present.
- `docs/strategy/Gift-Wishlist-App-Competitor-Analysis.md:26` — historical private-account URL identifier present.
- `docs/operations/meta-integration-setup-checklist.md:86` — current/historical URL-search pattern only; **not** an identifier-bearing account URL.

These are location reports, not proof that the links grant access. Gitleaks does not classify personal chat URLs as credentials. The current tracked snapshot no longer contains the two identifier-bearing URLs, but deletion from the tip does not remove history. The parent must review whether history sanitization is required before publication; this worker must not rewrite history or flip repository visibility. If any exposed credential is later confirmed, revoke/rotate it first and coordinate approved history cleanup separately.

## Changes made

- `.gitignore`: broadened local env/private credential protection while explicitly allowing `.env.example` and reviewed sample/template files; added build/test/package caches, SQLite sidecars, raw runtime-media/recording paths, backups, and local editor/agent scratch. No blanket PNG/JPG/audio/video/SQL rule: public design assets, fixture media, migration SQL, and deploy sources remain trackable. Private credential patterns are targeted; public certificates are not blanket-ignored.
- `README.md`: documented the inspected baseline and concurrent modules without claiming completion; actual Node/pnpm requirements, explicit Prisma config path, database roles/policies, synthetic seed limitations, demo-mode semantics, private provider setup, run/test commands, failure behavior, and deployment gaps.
- `LICENSE`: standard MIT grant, approved author/year. Third-party packages/fonts/assets keep their own terms.
- This report: reproducible evidence, redacted locations, API/license review, and integration blockers. It is an authorized audit output, not a new work-queue plan.

## Read-only dependency review

Registry values below were queried on **2026-10-27**. Latest-tag metadata is an observation, **not an upgrade instruction**. At inspection, the concurrent manifest/lockfile already declared `sharp`, `satori`, `@resvg/resvg-js`, and `@playwright/test` at the versions below; `whatsapp-api-js` was not declared. Dependency changes and validation belong to the parent, serialized against the lockfile.

| Exact npm ID / observed version | License / compatibility | APIs and integration boundary |
|---|---|---|
| `whatsapp-api-js` **6.3.0** | **MIT**; no declared runtime or peer dependencies; registry engine is the structured `engines.runtime` Node requirement **>=22.13.0**, not the conventional `engines.node` field | `WhatsAppAPI`, `post(data, raw_body, signature)`, `get(params)`, `retrieveMedia(id, phoneID?)`, `fetchMedia(url)`; `whatsapp-api-js/middleware/next` exports the Next middleware class with `handle_post(Request)` / `handle_get(Request)`; `whatsapp-api-js/setup/node` exports `NodeNext(settings)` |
| `sharp` **0.35.5** | **Apache-2.0**; Node **>=20.9.0**; `semver`, `@img/colour`, `detect-libc`, optional native image/libvips packages | `sharp(input, options).png().toBuffer()`; set bounded `limitInputPixels`, keep `unlimited` false, and bound input bytes/concurrency before decoding. Constructor's documented default pixel ceiling is **268402689**, too large to adopt blindly for phone uploads |
| `satori` **0.63.2** | **MPL-2.0**; Node **>=16**; React-like element renderer with font/layout dependencies, not Chromium | Default async `satori(element, { width, height, fonts })` yields SVG; pass licensed local font bytes and controlled layout. Remote image sources may cause I/O: use validated local bytes/data URIs, not arbitrary contributor URLs |
| `@resvg/resvg-js` **2.6.2** | **MPL-2.0**; Node **>=10**; platform-specific optional bindings, including Windows x64 MSVC and Linux ARM64 GNU/musl | `new Resvg(svg, options).render().asPng()`; upstream types also expose `renderAsync`, `imagesToResolve()`, `resolveImage()`, dimensions and RGBA pixels. Render only controlled SVG; do not add untrusted URL/path resolution |
| `@playwright/test` **1.64.1** | **Apache-2.0**; Node **>=20**; depends on `playwright` **1.64.1** | `test`, `expect`, `defineConfig`, and the Playwright CLI/browser install step belong to browser testing only. Browser downloads are separate from package metadata and were not performed. Never retain production contacts, cookies, or secrets in traces/screenshots/videos |

### Security, licensing, and adoption notes

1. **Official API, independent wrapper.** `Secreto31126/whatsapp-api-js` describes an independent client of the official Cloud API. Do not call it an official Meta SDK. Do not substitute WhatsApp Web/reverse-engineered clients.
2. **Webhook verification stays enabled.** Upstream documents secure mode as default; raw body plus signature are mandatory in that mode. Never turn it off to accept malformed fixtures. `get()` is challenge verification, not authentication of a gift-circle user. Verify the exact pinned release API and error mapping before replacing the incoming custom parser.
3. **Authenticated media fetch is a credential boundary.** Upstream explicitly warns that `fetchMedia(url)` sends the access token. Accept only trusted URLs obtained from `retrieveMedia` under the authorized ingestion path; reject arbitrary user URLs and validate redirect/host behavior. The wrapper does not supply capability consent, idempotency, storage limits, OTP, BSUID policy, or the six-task product boundary.
4. **Native packages need platform proof.** Windows x64 success does not prove Oracle Linux ARM64 success. Confirm GNU versus musl, optional dependency delivery, pnpm build-script policy, resource limits, and executable availability. Do not globally enable arbitrary lifecycle scripts to solve one native-install issue.
5. **Rendering is not authorization.** Neither Satori nor resvg prevents an owner from fetching a card. Actor-scoped DB reads and no-store/no-preview friend-only HTTP responses must wrap the renderer. Contributors' messages remain their own text; generated copy must not choose state transitions.
6. **Licenses remain separate.** MIT project code can use these packages without relicensing the whole project to MPL. MPL applies at the covered-file level; if modifying/distributing covered code, preserve notices and satisfy its source obligations. Keep Apache notices and audit fonts and sharp's bundled/transitive native components separately. This is direct package metadata review, not a complete software/font/asset license bill of materials.
7. **No advisory clearance claimed.** No vulnerability audit endpoint was called because this pass must not upload dependency/repository data. Metadata and security-boundary analysis do not prove these versions are free of advisories. The parent should evaluate advisories and reachable paths before changing a pin; never run a blind `audit fix` or `@latest` upgrade.

## Integration blockers / evidence still required

These are findings for the parent to reconcile with the existing work queue, not a claim that another worker failed or finished:

- **History/privacy decision:** review the two historical account-URL locations before an external release. Re-run redacted scans after all workers' files are assembled and against the exact publication candidate; untracked additions were not in the initial 103-file snapshot.
- **Prisma discovery:** `prisma7.config.ts` is the only inspected config; scripts use bare `prisma generate/migrate`, and `tests/leak/global-setup.ts` invokes the CLI without `--config`. README gives an explicit local path, but test/deploy entry points still need consistent discovery and a fresh-checkout run.
- **Demo access and authentication:** seed uses fictional BSUID identities and synthetic allowlist hashes, not joinable phone fixtures. `/c/<slug>`'s inspected gate is an allowlist-number match, not proof of possession. A newly arriving owner-session helper is POSIX/production-only and does not establish Windows demo access or WhatsApp OTP completion. Prove safe seeded owner/friend access without printing session credentials or adding real numbers.
- **Live/provider path:** incoming protocol, vision, ledger and card files/tests are not evidence of a mounted webhook, persistent ingestion worker, consent-gated model call, ffmpeg conversion, seven-day media handling, approved OTP template, or successful physical-device run. Model/person-safe vision and deterministic explicit-demo fallback need actual fixtures and recorded outcomes.
- **Card release boundary:** renderer and validator files have appeared; friend-only routes, PNG retrieval, contributor persistence, owner 404/no-store/no-preview behavior, local-font provenance/runtime availability, and human-only reveal still need integrated proof. The inspected renderer relies on a font path inside the Next distribution; verify that exact deployment artifact or use a reviewed licensed asset.
- **Exact-candidate tests:** no tests/build were run by this worker. Run typecheck, the normal leak suite, intentional red proof then restoration, all module tests, browser flows, production build, health checks, and real-device owner-blindness/capability-off/person-guard/card checks on the assembled candidate.
- **Deploy/runtime evidence:** root Compose is PostgreSQL-only; new Oracle templates are unexecuted from this worker's perspective. Validate TLS, ARM64 native bindings, private ports/media/secrets, role/policy application, backups and restore recovery. Existing setup/demo docs contain planned commands and `/healthz` references; implemented baseline health route is `/health`.
- **Tooling owner:** scanner availability and scans are verified; global/repository hook-chain integration and automated pre-push/CI secret/phone checks were not changed or exercised here. A configured hooks path alone is not enforcement proof.

## Local scan artifacts

All scan outputs are outside the repository under:

`C:/Users/apsch/.qoder/tmp/C--Users-apsch-Documents-personal-gifts-registry/tool-outputs/session-503255f9-d937-48e8-8b9e-edd1878aac28/`

- `release-history-gitleaks.json` / `.log`: redacted initial history results and captured scanner output.
- `release-tracked-gitleaks.json` / `.log`: redacted initial tracked-snapshot results.
- `release-scanner-status.json`: exit codes and location-only finding metadata.
- `release-location-audit.json`: phone/private-URL locations and scanned HEAD/commit/path counts; contains no matched values.
- `release-email-locations.json`: location/category-only tracked email result.
- `release-gitleaks.toml`: explicit default-rule extension; no baseline/allowlist additions.
- `release-tracked-snapshot/`: initial local scan input, **not a release artifact**. Do not publish it.
- `release-final-history-gitleaks.json` / `.log`, `release-final-candidate-gitleaks.json` / `.log`, and `release-final-status.json`: final redacted scans, counts, and documentation validation results.
- `release-candidate-snapshot/`: final tracked-plus-owned local scan input, **not a release artifact**. Do not publish it.

No raw local environment files were copied into the snapshots. Logs/reports were captured rather than printed; only status, counts, rule IDs, and file/line locations are suitable for handoff. Owned files are deliberately left unstaged and uncommitted for the parent to integrate, as requested.

## Parent assembled-candidate verification — 2026-10-27

The original worker's 103/106-path scans and no-runtime verdict above are historical, bounded evidence. Later integration assembled all tracked and nonignored untracked working files, including incoming source, tests, fixtures, assets, deployment artifacts and reports. A local outside-repo snapshot and SHA-256 manifest covered **214 files**; private environment files were rejected before copying, and symlink/outside paths were refused. Nothing was uploaded.

- Gitleaks **8.30.1**, default rules explicitly extended, `--ignore-gitleaks-allow`, `--redact=100`, no baseline: assembled candidate and all **26 locally reachable commits** each returned **exit 0, zero findings**.
- Separate contiguous/separator-tolerant South African phone checks returned **zero candidate locations and zero history paths**. No missing candidate files or tracked-ignored files were found. Results expose counts/locations only, not matched values.
- The scan is refreshed after the final closeout/report/index edits using the same snapshot and manifest procedure. Outside-repo artifacts are `assembled-manifest.json`, `assembled-release-status.json`, `assembled-{history,candidate}-gitleaks.json/.log`, and `assembled-candidate-snapshot/`. The snapshot is private local scanner input, not a release artifact.
- Normal real-PostgreSQL verification passed **393/393 Vitest cases in 34 files**, followed by typecheck, production build and **10/10 production Chromium flows**. Development browser flows passed too. The configured Prisma entry points now explicitly pass the existing config path. A fresh dependency install/Oracle artifact was not tested.
- Private item/draft/settings/card adapters and the signed webhook are mounted; ten real-DB WhatsApp integration cases exercise dedupe, immediate explicit-demo media, private candidates, confirmation, queue-worker lifecycle and consent/lock regressions. No live WhatsApp send, real model response or real FFmpeg subprocess follows from this evidence.
- Card save/load/PNG, no-JavaScript anonymous save, contributor-only updates, owner/forged-role generic no-store 404s and no preview are tested. Local installed font/native packages work; the dynamic React renderer require is not included in route traces, so minimal standalone/Oracle ARM64 portability is still unverified.
- The additional intake review's pool-starvation and grant-expiry opt-out findings were reproduced and repaired before the final runtime chain. No failed test was skipped and no RLS policy was removed for these regressions.

**Still not public-release certification.** Historical account-URL identifiers above remain a publication decision even though they are absent at the tip. Live Meta/WhatsApp/SAM, possession-based friend authentication/Windows owner issuance, mounted throttling, complete ledger product actions, Oracle delivery/restore, human accessibility/usability, k6 load and complete asset/font/advisory clearance remain open in the [indexed closeout](../../plans/parallel-build-closeout.md). No staging, commit, push, hook/config change, history rewrite or public flip was performed. Humanizer copy suggestions await approval; contributors' words are unchanged.

## Research sources

- npm registry metadata: [whatsapp-api-js](https://registry.npmjs.org/whatsapp-api-js/latest), [sharp](https://registry.npmjs.org/sharp/latest), [satori](https://registry.npmjs.org/satori/latest), [@resvg/resvg-js](https://registry.npmjs.org/@resvg/resvg-js/latest), [@playwright/test](https://registry.npmjs.org/@playwright/test/latest).
- WhatsApp wrapper source (retrieved with `gh api`, upstream main rather than installed release): [webhook API](https://github.com/Secreto31126/whatsapp-api-js/blob/main/src/apis/webhook.ts), [media API and authenticated-fetch warning](https://github.com/Secreto31126/whatsapp-api-js/blob/main/src/apis/media.ts), [Next middleware](https://github.com/Secreto31126/whatsapp-api-js/blob/main/src/middleware/next.ts), [Node setup](https://github.com/Secreto31126/whatsapp-api-js/blob/main/src/setup/node.ts).
- [sharp constructor limits](https://sharp.pixelplumbing.com/api-constructor/), [sharp output/metadata behavior](https://sharp.pixelplumbing.com/api-output/), [Satori rendering/fonts/images](https://github.com/vercel/satori/blob/main/README.md), [resvg types](https://github.com/yisibl/resvg-js/blob/main/index.d.ts).
