# Agent wishlist — gifts-registry

**Not a human task list.** Agents append here when they need infrastructure, tooling, API access, MCP installs, CLI packages, LLM skills, **quick references**, or workflow improvements that would help future sessions — better quality, fewer mistakes, lower token cost, faster verification. This includes **inefficiencies**: having to explore the codebase, AWS, Mongo, or WP to find a fact that should be a pointer in `ARCHITECTURE.md` or a runbook.

Humans triage when convenient. Do **not** treat open items as blockers unless the user says so.

Routing: repo-specific items **here**. Workspace-wide MCP/CLI/skills → umbrella `Documents/3bo/WISHLIST.md`. Ops: `docs/operations/AGENT_KNOWLEDGE_ECOSYSTEM.md` (bike-tracker) or skill `repo-wishlist`.

## How to append

Newest first. No secrets (no tokens, passwords, or private URLs with credentials). Do **not** duplicate open items — bump the date or add a note. Append even if you finished the hunt this session.

```markdown
## YYYY-MM-DD — short title
**Kind:** tooling | access | automation | skill | quickref | inefficiency
**Requested by:** agent (brief context — repo/task)
**Pain:** what you had to do instead (search, explore, wait)
**What would help:** concrete ask (CLI, MCP, path in ARCHITECTURE.md, skill, hook, CI)
**Where it should live:** ARCHITECTURE.md §N / runbook path / MCP / skill / CI
**Alternatives considered:** optional
**Status:** open
```

**Kinds:** `tooling` missing CLI/MCP · `access` credential *scope* (never values) · `automation` repeated manual step · `skill` recurring task class · `quickref` fact that should be a one-line pointer · `inefficiency` token/time tax from undocumented layout or deploy truth.

**Not here:** agent errors (`MISTAKES.md`) · product work (`docs/plans/`). Prefer fulfilling `quickref` by editing `ARCHITECTURE.md` in the same turn, then mark **fulfilled**.

---

## 2026-11-04 — Vitest 5 exits before collecting files on this Windows checkout
**Kind:** tooling
**Requested by:** agent (screen tests after the circle share/edit UI change)
**Pain:** `pnpm exec vitest run` printed "No test files found" and then crashed in Vite's source-map helper (`code.charCodeAt is not a function`). Screen markup was checked with `tsx` instead. `tsc --noEmit` still ran.
**What would help:** a Vitest version or config that collects `tests/**/*.test.ts` under PowerShell without that runner crash, so `pnpm test` is usable again.
**Where it should live:** `vitest.config.ts` / `package.json` once reproduced on a clean tree.
**Status:** open

## 2026-11-04 — No WhatsApp Manager or Cloud API MCP in this Cursor session
**Kind:** tooling
**Requested by:** agent (checking whether the authentication template is Approved)
**Pain:** Template approval cannot be read from the repo or from any connected MCP. The operator has to open WhatsApp Manager. Graph can list templates only after `WHATSAPP_ACCESS_TOKEN` exists, and that key is absent from the VM env and from vault (`repo=gift-registry`).
**What would help:** a Meta WhatsApp Business MCP, or a documented `presence_check` plus a redacted Graph template-status command once the token is in vault.
**Where it should live:** Cursor MCP config (not the product). Checklist already notes an optional day-1 Meta MCP in `docs/operations/meta-integration-setup-checklist.md` §E.
**Status:** open

## 2026-11-04 — Live image tag and Caddy recreate rule were not in the architecture map
**Kind:** quickref
**Requested by:** agent (create-circle 404 on pinata.scholtz.work, then share/edit work that is not deployed)
**Pain:** Had to SSH, `docker ps`, and read the mounted Caddyfile to learn the image tag, that `admin off` blocks `caddy reload`, and that `@app` matched only exact `/app`.
**What would help:** one paragraph in the architecture map. Added this turn.
**Where it should live:** `ARCHITECTURE.md` §6
**Status:** fulfilled

## 2026-11-01 — `prisma migrate dev` hangs on stdin under muse.powershell; entry-hub browser spec red on base too
**Kind:** inefficiency
**Requested by:** agent (applying migration `20261101000000_shared_registry` to the dev DB; running `tests/browser/entry-hub.spec.ts`)
**Pain:** `pnpm db:migrate` sat ~15 min with no output (likely a TTY prompt with no TTY), had to be terminated, and left orphaned backends holding the migrate advisory lock so `db:deploy` then timed out (P1002) until the orphans were terminated via `pg_terminate_backend`. Separately, the browser `entry-hub` create-circle flow 422s on same-origin in this dev environment — reproduced on the base tree with work stashed, so pre-existing, not a regression — while the Vitest hub tests covering the same handler stay green.
**What would help:** document `pnpm db:deploy` (non-interactive) as the apply path for existing migrations and reserve `db:migrate` for authoring new ones; triage why the Playwright-booted Next dev server rejects the browser `Origin` (suspect `webServer.env` `CIRCLE_BASE_URL` not reaching the server, or a Chromium quirk in this host).
**Where it should live:** README dev-commands note; browser-runbook or `playwright.config.ts` comment.
**Status:** open

## 2026-10-27 — No draw.io CLI, so `.drawio` cannot be verified as a picture
**Kind:** tooling
**Requested by:** agent (drew the intended registry-network journey in `docs/diagrams/*.drawio`)
**Pain:** `where drawio` finds nothing on this host, so the skill's own checklist item "visually verified PNG
conversion" cannot be run. Hand ray-tracing the routing instead **failed in front of the user** — an edge ran through
a tile whose centre-x matched a neighbour's, and a `text;html=1` block ran 4000px off canvas because that cell type
never wraps. A geometry checker now exists at `%TEMP%\qoder-scratch\drawio_check.py` and caught 34 and 23 defects in
the two diagrams I believed were clean; it validates polylines, tile crossings, corridor separation, label placement
and text fit, and it is **not** the same as having seen a rendered picture.
**What would help:** install draw.io Desktop so `drawio -x -f png -s 2 -t -o …` works, then a CI step that exports
`docs/diagrams/*.drawio` to committed `.drawio.png` and fails when the two drift.
**Where it should live:** global toolchain, then `.githooks` or the docs CI job for the export.
**Status:** partially closed 2026-10-31 — (2) is done: the checker is promoted to
`~/.agents/skills/draw-io/scripts/drawio_check.py` (scholtzap/skills#65, merged) and SKILL.md §4.3 now states the two
rules it encodes plus that a clean geometry run is not a rendered-PNG check. (1) stays open: no draw.io CLI on this
host, so `docs/diagrams/*.drawio` still has no committed PNG and nothing fails on drift.


## 2026-10-26 — PDFs are unreadable by the Read tool on this host
**Kind:** inefficiency
**Requested by:** agent (had to ingest three hackathon PDFs)
**Pain:** `Read` on a PDF fails for want of poppler/pdftoppm; had to discover `pypdf` was installed and write an
extraction loop into `.scratch/` to get any text out.
**What would help:** either install poppler-utils so the Read tool's PDF path works, or add a repo script
`scripts/ops/extract_pdf_text.py` so the next session does not re-derive the workaround.
**Where it should live:** `docs/operations/` runbook, or the global toolchain.
**Status:** open

## 2026-10-26 — GitHub Actions minutes are blocked while this repo is private
**Kind:** access
**Requested by:** agent (both day-0 workflows failed in 4s)
**Pain:** `ubuntu-latest` jobs never started; the real reason was only visible in a check-run **annotation**, not
in `--log-failed`, which returned "log not found". Cost a full debugging detour on workflows that were fine.
**What would help:** publish the repo (public repos get unlimited free Linux minutes, and the hackathon requires a
public repo anyway). Independently: a note in `ARCHITECTURE.md` §6 that a 4s failure with no log means billing, not
YAML, so the next agent does not go hunting for a syntax error.
**Where it should live:** ARCHITECTURE.md §6 + `docs/operations/meta-integration-setup-checklist.md` §D
**Status:** fulfilled — repo is public (`gh` 2026-11-04); ARCHITECTURE §6 CI quickref updated same day

## 2026-10-26 — Cursor is not a documented Meta Model API provider
**Kind:** quickref
**Requested by:** agent (brief assumed Cursor + Muse Spark as an OpenAI-compatible custom provider)
**Pain:** Meta's coding-agents page documents Claude Code, Codex and OpenCode. **Cursor is not mentioned anywhere**,
so the assumed IDE path is unverified rather than supported.
**What would help:** one line in AGENTS.md / the findings doc stating that Claude Code is the verified route to
`api.meta.ai`, and Cursor is try-at-your-own-risk. Prevents a future session betting a workflow on it.
**Where it should live:** AGENTS.md "Verified platform constraints" — **fulfilled** there and in
`docs/strategy/investigations/Meta-Model-API-and-WhatsApp-Cloud-API-findings.md`
**Status:** fulfilled

## 2026-10-26 — A card is required before any Meta Model API call works
**Kind:** quickref
**Requested by:** agent (day-1 checklist)
**Pain:** the requirement is stated in the participant-guide PDF and the acceptance email, but **not** on the
hackathon page or the API docs, so it initially looked unverified and nearly got filed as a risk instead of a
prerequisite.
**What would help:** a standing day-1 line: attach payment method, then claim credits, then expect batched
distribution. Also set the Billing spend-limit alert.
**Where it should live:** `docs/operations/meta-integration-setup-checklist.md` §B — **fulfilled**
**Status:** fulfilled
