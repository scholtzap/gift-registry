# Agent wishlist

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
