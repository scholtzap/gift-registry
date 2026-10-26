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
**Status:** open — resolved by flipping visibility

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
