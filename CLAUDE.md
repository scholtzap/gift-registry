# CLAUDE.md — gift-registry

`AGENTS.md` at this repo root is the source of truth for all agent instructions; this file only
carries the doc-kb skill wiring Claude Code needs. Read `AGENTS.md` first.

## Documentation KB skills

Skills path: ~/.claude/skills/

| Task | Skill |
|------|-------|
| First-time KB setup | /doc-kb-setup |
| Save docs to Notion/Outline | /doc-kb-save (only when asked; CI owns sync) |
| Load context from KB | /doc-kb-load (auto when topic needed) |
| Audit cross-source drift | /doc-kb-consolidate |
| Fill a documented gap | /doc-kb-build |
| Enforce local docs health (archive, merge, links) | /doc-kb-enforcer |

Config: DOC_SYNC_TARGET=notion in .env

## Documentation KB sync (auto-managed)

### doc-kb-load (on demand)
When context is needed for a specific topic, run `/doc-kb-load <topic>` **before answering**.
- Do NOT load all docs at session start
- Search Notion MCP or Outline API by topic keyword — fetch only relevant pages
- Fall back to local `docs/` grep if KBs are unreachable
- Source priority: per DOC_SYNC_TARGET — both → try Notion first (richer search); outline only → Outline API; notion only → Notion MCP

### repo-memory (free-game)
Save to `.memory/main.sqlite` (project-memory MCP) at any time without asking. Read at session start.
