# Operator-private docs (not in git content)

This folder’s **payload files are gitignored**. Only this README is tracked.

## What belongs here

Facts that agents and operators need locally (and may push to Notion by hand)
but must never land in the public GitHub tree — especially host addresses,
SSH inventory, and other deploy recon.

## Convention

| File | Tracked? | Purpose |
| --- | --- | --- |
| `README.md` | yes | This note |
| `oracle-host.md` | **no** (gitignored) | Live Oracle VM SSH target and paths |

Create missing payload files from the templates named in `ARCHITECTURE.md` §6
and `docs/deployment/oracle-vm.md`. Never put the real host address in a
tracked markdown file.

## Notion

CI sync skips this folder’s ignored files (they are not in the repo). To publish
`oracle-host.md` into the Gift Registry Notion hub, run `/doc-kb-save` from a
machine that has the local file, targeting `--file private/oracle-host.md`.
