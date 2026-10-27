# MISTAKES.md — gift-registry

Agent error log. Newest entry first. No secrets, tokens, env dumps, or credentialed URLs.

## 2026-10-27 — Pushed the rebrand before running the browser suite
**What happened:** the Paper Fiesta commit was pushed after vitest, typecheck and build passed, but before `pnpm test:browser`; two Playwright flows then failed on renamed labels ("Claim this gift", "Pool target in cents").
**Impact:** the pushed branch briefly carried a red browser suite; caught before the PR was opened and fixed in a second commit (11/11 green).
**Fix:** browser spec updated to the new labels and the rand quick-pick flow; PR #9 opened only after the full browser run.
**Do not repeat:** any copy or label change runs `pnpm test:browser` (with the test DB) before the first push, not after.

## 2026-10-27 — Stitch mocks shipped wrong dates
**What happened:** the round-2 Stitch prompts said "Sat 15 Nov" for 2026-11-15 (a Sunday), and the summary to the owner said "18 days" where the mocks said 19.
**Impact:** mocks presented as reviewable carried a wrong weekday and a contradicting count; caught only when the real `<EventDate>` render printed "Sun".
**Fix:** dates on screen now come from `<EventDate>` (UTC, computed); DESIGN.md tells agents to re-check numbers and weekdays in any mock.
**Do not repeat:** compute weekdays and day counts with code before putting them in a prompt or a reply.

## 2026-10-27 — Parallel Stitch generations in one project were silently dropped
**What happened:** three `generate_screen_from_text` calls were fired at once into one Stitch project; all three timed out client-side and only one screen was ever created.
**Impact:** about ten minutes of waiting on screens that did not exist; `list_screens` returning `{}` hid it.
**Fix:** generations re-run one at a time, each confirmed by the project's `updateTime` advancing. The rule is now in the global `stitch-ui-designer` skill.
**Do not repeat:** one Stitch generation per project at a time; treat a timeout as "still running", and verify by `updateTime`, not `list_screens`.

## 2026-10-27 — An inherited grant expiry could undo a user opt-out
**What happened:** capability toggles changed enabled/source but retained expiresAt; the gate ignored expired user rows and fell back to the granting plan.
**Impact:** a user's explicit refusal could later permit model spending. Three real PostgreSQL regressions reproduced the failure, including an already-expired user opt-out.
**Fix:** user-source choices always prevail; toggles clear expiry. All 14 gate cases pass, including expired non-user grant fallback.
**Do not repeat:** test state changes from expiring grants to user choices, not only fresh rows and current enabled values.

## 2026-10-27 — Ingest locks borrowed connections their callbacks needed
**What happened:** session advisory locks used the same ten-connection pool as Prisma actor queries while holding connections across external work.
**Impact:** sufficient concurrent holders starved the queries needed to finish and release those locks; a real database regression reproduced transaction acquisition failure.
**Fix:** a separate bounded two-connection advisory pool, acquisition timeouts and discard on failed unlock. The twelve-lock regression and all ten real intake cases pass.
**Do not repeat:** verify resource ownership across callback boundaries; a non-transaction lock still holds a database connection.

## 2026-10-27 — Hook removal left repeated form names with duplicate IDs
**What happened:** making private screens hook-free for Node App Route rendering left a name-derived Field ID default. Repeated fields with the same name collided.
**Impact:** the full screen suite failed its unique-label association assertion even though production navigation passed.
**Fix:** Field requires an explicit unique ID from every caller; the final full suite passes 393 cases.
**Do not repeat:** test repeated reusable controls after SSR changes; native navigation and accessibility naming are separate checks.

## 2026-10-26 — Wrote an RLS policy without a `FOR` clause and it silently became a SELECT policy
**What happened:** `CREATE POLICY items_owner_write ON items TO app_owned USING (app_actor_owns_circle(circle_id))`
read as "the owner may write their own items". With no command clause, PostgreSQL applies a policy to **all**
commands, including SELECT — and permissive policies are OR-ed, so that broad `USING` clause was enough to return
every row in the circle.
**Impact:** The owner projection came back with the friend's secret suggestion *and* the owner's own tombstone: the
two rows whose hiding is the entire product rule. Nothing errored. The migration was fine, the file applied, the
role switched. Had the leak suite not existed this shipped, and it would have shipped as "privacy by construction".
**Fix:** every policy in `src/server/db/policies/002_policies.sql` now carries an explicit command clause;
`items_owner_write` became `items_owner_update` + `items_owner_insert`. The assertion that caught it is
`sees only their own confirmed, un-tombstoned items` in `tests/leak/owner-blindness.test.ts`.
**Do not repeat:** An absent `FOR` is not "unspecified", it is "everything". Write the command clause on every
policy, and treat a policy whose `USING` clause does not mention the column that must stay hidden as a bug you have
not found yet.

## 2026-10-26 — Passed `{ pool }` to `PrismaPg` and it connected to a different database
**What happened:** the adapter's first parameter is `pg.Pool | PoolConfig | string`. I passed `{ pool }`, which is a
valid-looking object, so TypeScript said nothing and the adapter read it as a `PoolConfig` with one unknown key.
**Impact:** every query went to `localhost:5432` with default credentials instead of the URL under test, and the
error surfaced as `ECONNREFUSED` on the first insert. In production the same mistake points at whatever happens to
be listening locally — a silently wrong DSN is a data-exposure bug, not just a crash.
**Fix:** `src/server/db/client.ts` passes the `Pool` instance itself and says why in one line; the dev URL and the
test URL now both resolve through `createDb(connectionString)`.
**Do not repeat:** After wiring an adapter or driver, prove the connection lands where you think by reading it back
(`SELECT current_database()`), not by trusting that the constructor accepted the object.

## 2026-10-26 — Proposed a share-card link preview without asking who else sees a preview
**What happened:** While ideating the gift-card feature, I recommended making the generated card the Open Graph
preview image of the share link, because "the link preview *is* the artefact". The card carries every
contributor's name — and the link is pasted into a WhatsApp group that **contains the gift recipient**.
**Impact:** Had that gone into the day-6 build, every pool would have announced its contributors to the owner
through a Meta-rendered preview, breaking the one rule the product exists to hold. RLS, the role-scoped view
builder and role-scoped agent toolsets would all have been green while the leak happened, because none of them
own the preview path. It is the same class as the leak the SPEC already names (browser cache, network response)
but through a channel that is not our HTTP response at all.
**Fix:** `AGENTS.md` now states the rule ("the reveal is a human act" — no send, no `og:` tags, no cacheable
response on card routes, 404 not 403 for the owner); `SPEC.md` records the decision and the rejected
alternative; `ARCHITECTURE.md` §8 adds the preview/cache rows to the leak-suite matrix;
`docs/plans/gift-card-f10.md` and the day-9 checklist make the group-preview check a gate rather than a memory.
**Do not repeat:** When an artefact is generated from private data, enumerate **every** channel that will render
it — not just the routes you wrote. A link preview, a notification payload, an OS clipboard thumbnail, a CDN or
shared cache, and an embed card are all readers you did not authorise, and social surfaces almost always include
the person you are hiding from. "It is a beautiful share artefact" is exactly the framing that skips that step.

## 2026-10-26 — Reported a hook as "installed" without ever proving it fired
**What happened:** The plans-registry installer wrote `.githooks/pre-commit`, and the setup was reported as
complete because the file existed. `core.hooksPath` is set *globally* to `~/.config/git/hooks`, so that repo
hook was never on git's path; the dispatcher only reaches it when `git config hooks.chainDir` points at it,
and that was unset. Every commit in this session passed an index-freshness gate that did not run.
**Impact:** A safety check was believed present while absent — the same class of false success as a leak suite
that passes for the wrong reason. The `PLANS_INDEX.md` staleness rule in the global instructions is enforced
only by this hook plus CI, and CI is currently blocked by Actions billing, so for this repo the gate was
purely imaginary.
**Fix:** `git config --local hooks.chainDir .githooks`, the chained hook executed, and `ARCHITECTURE.md` §7
now records the chain and says to verify by execution. Documented in
`security_best_practices_report.md` (F6) with the note that git config is machine-local, so a fresh clone
still relies on CI.
**Do not repeat:** Prove a guard runs, then prove it fails. For any hook, gate or scan, execute it once and
see it refuse a bad input — file existence and installer output are not evidence. This is the second time
this session that "the tool said Installed" was the wrong stop: read the actual resolution path
(`git config --get core.hooksPath`, `git config --get hooks.chainDir`) before believing the claim.

## 2026-10-26 — Planning handover carried three wrong API assumptions
**What happened:** The pre-session handover specified WhatsApp OTP for friend auth, ~30-day
webhook media retention, phone numbers as the primary user key, and "search Meta Marketplace"
for deal-finding. Verification against Meta's own docs found all four wrong or unsafe.
**Impact:** Had we built to the handover, the deal-finding feature would have breached Meta's
Automated Data Collection terms (a stated disqualification condition for this hackathon), the
OTP flow would have been miscategorised as a free utility message, media parses would break
after 7 days, and the identity model would silently lose users once Business-Scoped User IDs
roll out.
**Fix:** Deal-finding moved to Meta Model API `web_search` grounding. OTP designed as an
*authentication* template. Media parsed on ingest. BSUID is the primary key with phone as
fallback.
**Do not repeat:** Treat an inherited brief's integration claims as research tasks, not facts.
Especially for third-party platform APIs where the brief says "research feasibility" — that
phrase means a decision is still open, and the open decision may be the one that disqualifies
the project.

## 2026-10-26 — Ran a shallow local scan before fanning out research
**What happened:** On first orientation I listed the folder and read two files directly, then
stopped to ask, instead of parallelising the three external unknowns (Meta Model API, WhatsApp
Cloud API, Marketplace legality).
**Impact:** Burned part of day 1 of a 10-day build window on serial discovery.
**Fix:** Spawned independent research subagents concurrently with local reads.
**Do not repeat:** When unknowns are external and independent, delegate them in the same turn
as the local read rather than after it.
