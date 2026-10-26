# Security review — gifts-registry (pre-publication gate)

**Mode:** report (+ the low-risk fixes applied in the same turn)
**Scope:** the repo as it stands before flipping `scholtzap/gift-registry` from private to public —
54 tracked files, 3 commits of history, both GitHub Actions workflows, the ops Python scripts, the
Cursor hooks, and the MCP/agent config files.
**Date:** 2026-10-26 · **Reviewer:** agent, skill `secure-code-review`

## Executive summary

No credentials are committed and none are recoverable from history. The Material finding is not a
secret — it is **personal identity embedded in the docs**: a deep link to your private Gemini
conversation, your bare email in a tracked `.env.example`, your secrets-manager item path in the
setup checklist, and the Notion hub page ID hardcoded in a workflow that becomes world-readable.
All four are fixed. Two structural gaps were found and one is only half-closed (F6) because the fix
is machine-local.

Nothing here blocks making the repo public, provided the two **accepted risks** (F1 history, F7
third-party PDFs) are read and agreed, and F4's follow-up action is done before the next CI sync run.

## Findings

### Medium

**F1 — Private AI-conversation deep link published in two tracked docs.**
`docs/strategy/Gift-Wishlist-App-Competitor-Analysis.md` (was line 26) and
`docs/_archive/Gift Wishlist App Competitor Analysis (original gemini export).md` (line 3).
*Impact:* a public hackathon repo would have tied the product idea to your personal Google account
and handed readers a link into a private conversation that only you can open.
*Remediation (applied):* link removed from both files; the active doc's frontmatter now records the
redaction and the archive carries a one-line redaction banner above the transcript.
*Accepted residual:* the URL still exists in git history at these paths. It is a session-scoped link
to a Google-authenticated page, so it grants a reader nothing, and rewriting three commits on a repo
about to be published is more risk than the artifact is worth. If you would rather it were gone
entirely, say so before the flip and history gets rewritten once, while no one else has cloned it.
The transcript *text* — including your voice-transcribed origin prompt — is deliberately kept: it is
the provenance record for the product decision and contains no credential.

**F2 — Personal email in a tracked template.**
`.env.example:3` shipped `NOTION_ACCOUNT_EMAIL=` populated with your Gmail address.
*Impact:* harvested into spam and credential-stuffing lists the moment the repo is public; an
`.env.example` is a template, so a real value in it is a bug either way.
*Remediation (applied):* blanked. Your local ignored `.env` still carries it, which is correct.

**F3 — Secrets-manager layout disclosed.**
`docs/operations/meta-integration-setup-checklist.md:34` named the vault item path for the Meta key.
*Impact:* tells anyone who reads the repo exactly which entry to target if they ever get a foothold
in the vault, and which env var it feeds.
*Remediation (applied):* rewritten to say "your secrets manager, under the Meta entry" and added an
explicit instruction not to write item names or folder paths into this repo.

**F4 — Notion hub page ID hardcoded in a public workflow.**
`.github/workflows/sync-notion-docs.yml` set `NOTION_ROOT_PAGE_ID` inline.
*Impact:* not a credential, but it is a stable identifier for your KB tree, it invites the stale-root
failure mode the sync script was written to catch, and it makes the hub page un-movable without a
commit.
*Remediation (applied):* now reads `${{ vars.NOTION_ROOT_PAGE_ID }}`.
**Follow-up you own:** before the next CI sync, set `NOTION_ROOT_PAGE_ID` as an Actions **repository
variable** (Settings → Secrets and variables → Actions → Variables). Until you do, the sync run aborts
at the `--expect-root-title` guard rather than writing into the wrong page tree — loud failure is the
intended behaviour. Checklist section D updated to say this.

**F6 — The plans-index pre-commit gate was silently dead.**
`.githooks/pre-commit` exists, but `core.hooksPath` is global (`~/.config/git/hooks`) and the
dispatcher only chains to a repo hook when `hooks.chainDir` is set. It was unset and `.git/hooks/`
had no `pre-commit`, so the freshness check never ran while appearing installed — and the global
gitleaks scan was the only hook actually firing.
*Impact:* stale `PLANS_INDEX.md` commits pass locally and only fail in CI, which is currently
disabled by billing — i.e. no gate at all right now.
*Remediation (applied on this machine):* `git config --local hooks.chainDir .githooks`; verified the
chained hook executes. **Not closed portably:** git config is not committed, so a fresh clone repeats
the gap. CI's `plans-registry-gate.yml` covers everyone else — which is another reason the Actions
billing block should be resolved (flip to public: unlimited free Linux minutes).

**F7 — Third-party PDFs sit inside the repo directory.**
`docs/strategy/hackathon/*.pdf` (three, including a Gmail notification print) are correctly gitignored
and correctly absent from history, and `.scratch/*.pdf.txt` holds their extracted text.
*Impact:* only one sloppy step away from publication — a `git add -A` after a `.gitignore` edit, or
zipping/copying the folder to share it. The Gmail print carries your address and inbox metadata; the
Cerebral Valley prints are someone else's branded page material, and the hackathon rules disqualify
using assets you have no rights to.
*Remediation (recommended, not applied):* move both folders out of the repo, e.g.
`Documents/personal/gifts-registry-assets/`, and keep only your own markdown in `docs/`. Say the word
and it gets done; deleting them is not recommended since they are the source for the rubric doc.

### Low / verified-clean

**F5 — Credential exposure: clean.**
`gitleaks detect --source . --redact` over all 3 commits: **no leaks found**. Targeted greps over the
**entire working tree including ignored files** returned nothing for `+27` phone patterns, either
local format of the two real numbers, cloud VM hostnames, IP literals, or non-example domains. `.env`,
`.memory/main.sqlite`, `.claude/settings.local.json`, `.scratch/` and the PDFs are all ignored; the
ignore rules were verified with `git check-ignore -v`, not assumed.

**F8 — Unpinned `npx` package in committed MCP configs** (vibe-pattern 8, slopsquatting/drift adjacent).
`.cursor/mcp.json`, `.mcp.json`, `.openclaw/mcp.json`, `.codex/config.toml`, `.claude.json` all run
`npx -y mcp-sqlite` with no version, so every agent session on every clone pulls whatever is latest —
or whatever is published under that name next.
*Impact:* silent supply-chain update into a server that gets read-write SQL access to repo memory.
*Remediation (deferred — your call):* pin `mcp-sqlite@<version>`, or accept it and record the trust
decision. Deferred because the scaffolding script that generates these five files is the source of
truth and an un-pinned edit here gets reverted by the next `ensure-repo-memory.ps1` run.

**F9 — No prompt-injection payload in the imported AI transcripts.** The Gemini export and the
investigation docs were scanned for instruction-override text; none present. This matters because the
transcript *is* third-party model output committed into a repo that agents are told to read before
working.

**F10 — gitleaks needs no repo-local install or config.**
Already installed (8.30.1) and wired globally via `core.hooksPath` → `_dispatch`, which runs
`gitleaks git --pre-commit --staged --redact` on every commit on this machine and refuses the commit
if `gitleaks` is missing. A `.gitleaks.toml` was deliberately **not** added: gitleaks custom configs
replace the default rule set unless `[extend] useDefault = true` is written, so a file added now would
either weaken the guard or be an empty stub — a rule with no purpose. There are zero false positives
today, and `# gitleaks:allow` handles the first one.

## Verdict on "is there anything sensitive in the docs?"

Yes, and it was identity rather than credentials: the Gemini conversation link (F1), your email in
`.env.example` (F2), the vault item path (F3), the Notion page ID in the workflow (F4). All four are
removed from the tracked tree and re-grepped clean. No phone number, token, key or VM address appears
anywhere in the repo or on disk beneath it. **Ready to flip public**, with F7 worth acting on first and
F4's Actions variable needed before the next CI sync.

## Forward gates for the build (no code exists yet — these are pre-emptive)

Mapped to the rules in `javascript-typescript-nextjs-web-server-security.md` and the thirteen
vibe-coded patterns, against what SPEC.md and ARCHITECTURE.md already commit to:

| Gate | Rule | Why it bites this product | Build day |
|---|---|---|---|
| Webhook verifies `X-Hub-Signature-256` on the **raw** body before parsing | NEXT-WEBHOOK-001 · pattern 9 | Anyone who can guess the webhook URL can forge "friend X claimed item Y" | D1 |
| Link expansion is SSRF-guarded: allowlist http/https, resolve-then-reject private/link-local ranges, block the Oracle metadata endpoint, cap redirects and bytes | NEXT-SSRF-001 · pattern 4 | A friend pastes an arbitrary URL and **the server fetches it** — on a box that also hosts your DB | D4 |
| RLS is the IDOR control, not a `where` clause | NEXT-AUTH-001 · pattern 3 | Owner blindness is exactly an authorization boundary; already designed as three layers, keep it | D2 |
| Static rendering / router cache cannot carry a friend-scoped page | NEXT-CACHE-001 | Next.js will happily cache a per-circle page and serve it across roles — a leak that looks like a pass | D2–D3 |
| Server-only modules never reachable from client; `MODEL_API_KEY` never in `NEXT_PUBLIC_*` | NEXT-SECRETS-002 | The one edit that puts a billable Meta key in the browser bundle | D1 |
| OTP + allowlist endpoints throttled per phone and per IP | pattern 13 · NEXT-DOS-001 | Authentication templates are **charged per send**, so an unthrottled endpoint is a money leak as well as an auth bypass | D1–D2 |
| Downloaded WhatsApp media stored by opaque id, never by a path built from webhook fields | NEXT-PATH-001 · pattern 11 | Media ids and sender fields are attacker-influenced strings that reach the filesystem | D2 |
| Pool arithmetic: server recomputes every total; no client-supplied amount ever trusted | pattern 10 | "Pool shows funded because contributions were seeded" is a listed FALSE SUCCESS | D4 |
| Model output validated against the flat `json_schema`, and its text treated as untrusted when rendered | NEXT-INPUT-001 | A transcribed voice note can carry injected instructions into the owner's view | D3 |
| Error responses and logs free of phone numbers, tokens, full webhook payloads | NEXT-LOG-001 · NEXT-ERROR-001 | POPIA plus the leak definition in SPEC.md covers error text and network responses | every day |
| `pyproject`/`package.json` lockfiles committed, deps pinned, no auto-fix gates | NEXT-SUPPLY-001 · pattern 8 | Same class as F8 | D1 |

## Coverage statement

**Reviewed:** all 54 tracked files; full git history via gitleaks (3 commits, ~298 KB); both workflow
files; the five MCP/agent config files; `scripts/ops/**` and `.cursor/hooks/**` for embedded
credentials and subprocess/exec patterns; the ops and strategy docs for PII, personal-account URLs,
infrastructure identifiers and injected instructions; the working tree **including ignored files** for
phone numbers.
**Not reviewed:** application code — none exists; the vibe-pattern scanner ran against the repo and
returned **0 leads**, which reflects an empty target, not a clean app, and must be re-run on day 3
when the vertical slice lands; the contents of the ignored `.env` and `.memory/main.sqlite` beyond the
PII greps; the three gitignored PDFs' text (only their presence and ignore-rules were verified);
the `.scratch/` extracts beyond the PII greps; runtime/network posture of the Oracle VM, which is
unverified until day 1.
**Changes made in this pass:** four doc/config redactions (F1–F4), one workflow env change requiring a
follow-up Actions variable (F4), one local git config (F6). No secret values are reproduced in this
report. Regression risk: the sync workflow will fail loudly until the Actions variable is set.
