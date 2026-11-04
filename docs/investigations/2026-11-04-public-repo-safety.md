# 2026-11-04 — Is gift-registry safe to make public?

**Status:** closed  
**Asked:** operator, pre-submission hygiene

## What was noticed

`ARCHITECTURE.md` §6 still said “Public flip is not done”, while the hackathon requires a public repo and CI already assumes public minutes.

## Method

- `gh repo view` visibility / secret-scanning settings
- `gitleaks detect` on git history (99 commits) and working tree (`--no-git`)
- `git grep` / tree scan for `\+27[0-9]{8,9}` (AGENTS.md + `verify.yml` gate)
- Confirm `.env` never entered history (only `.env.example`); MCP JSON token-free
- Spot-check seed cast, demo stills, deploy docs for phones / keys / dumps

## Evidence

| Check | Result |
| --- | --- |
| GitHub visibility | **Already `PUBLIC`** (`scholtzap/gift-registry`) |
| Secret scanning | Enabled, including push protection + non-provider patterns |
| gitleaks (history + WC) | no leaks found |
| `+27…` phones in tree | none |
| `.env` in git | ignored; never added (history only touches `.env.example`) |
| Tracked MCP configs | project-memory command only; no tokens |
| Seed | fictional names; **no phone numbers** (`scripts/seed.ts`) |
| Demo stills (untracked `demo-recording/`) | “Demo Owner” UI; no real numbers visible |

## Intentional public identifiers (not secrets)

- Contact email `scholtzap@gmail.com` on `gifts.scholtz.work` contact paths
- Oracle host `<oracle-vm-ip>` and SSH user `ubuntu` in `ARCHITECTURE.md` / `oracle-vm.md`
- WABA asset id in `docs/plans/rn-f-claim-merge.md` (identifier, not a token)
- CI synthetic `SESSION_SECRET` / `PHONE_HASH_PEPPER` placeholders in `verify.yml`

## Residual (non-blocking)

- Tests use national-format fixtures `0831234567` and `0820000000`. CI only fails on `+27…`; AGENTS.md still prefers fictional cast with no assignable numbers — optional cleanup.
- Local branch is ahead of `origin/main` with a large dirty tree; do not add `.env` or real media. Untracked `demo-recording/` looks safe if committed later.

## Conclusion

Safe for the **already-public** GitHub tree from a secrets / real-phone standpoint. Stale “flip not done” wording in the architecture map was wrong and should be corrected in the same turn.
