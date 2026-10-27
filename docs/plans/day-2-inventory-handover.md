---
title: Day-2 remaining-work inventory handover (voice-to-deploy queue)
type: handover
status: implementing
priority: P1
rank: 3
updated: 2026-10-27
apps: []
related:
  - gift-circles-ten-day-build-plan.md
  - parallel-build-closeout.md
  - birthday-and-event-countdown.md
  - gift-card-f10.md
  - vision-cutout-intake.md
  - whatsapp-task-bot-surface.md
  - post-event-reveal.md
  - public-landing-page.md
evidence: Full incorporation 2026-10-27 of stray docs/plans/temp-chat-handover.txt (deleted after merge); read-only tree inventory 2026-10-27
archived_date: null
supersedes: null
superseded_by: null
---

# Day-2 remaining-work inventory handover

Lossless promotion of the stray `temp-chat-handover.txt` inventory (2026-10-27, day 2 of 10).
Stale bits are marked in place; the live plan of record stays
`gift-circles-ten-day-build-plan.md`. Every item below names its home plan — this file is the
queue cross-reference, not a second plan of record.

| Handover section | Home |
|---|---|
| §1 Tier 1 console work | `gift-circles-ten-day-build-plan.md` day 1 + `docs/operations/meta-integration-setup-checklist.md` |
| §2.1 voice, §2.2 link/ledger, §2.3 owner-blindness | `gift-circles-ten-day-build-plan.md` days 3–5 |
| §2.4 gift card | `gift-card-f10.md` |
| §2.5 SAM cutouts | `vision-cutout-intake.md` |
| §2.6 task bot | `whatsapp-task-bot-surface.md` |
| §2.7 reveal | `post-event-reveal.md` |
| §2.8 landing | `public-landing-page.md` |
| §3 Tier 3 verification/deploy/demo | `gift-circles-ten-day-build-plan.md` days 7–10 + `parallel-build-closeout.md` remaining-work list |

## 0. State inherited

| Fact | Evidence |
|---|---|
| Day-2 exit gate met (schema, RLS, `withActor`, seed, leak suite, session cookie, role-split routes, webhook ingest) | `prisma/migrations/`, `src/server/wa/`, `src/server/routes/circle.ts` |
| Day-1 exit gate not met — all four items are console work | §1 below |
| Tests at inventory time: 34 files / 393 passing, typecheck clean | Verified locally 2026-10-27. **Superseded:** 430 passing after the countdown build (`birthday-and-event-countdown.md`, "What was built") |
| Repo still private; flipping public needs explicit user go-ahead | `AGENTS.md` |
| Local gitleaks `dir .` = 0 findings with `.gitleaks.toml`; stop `next dev` before scanning or `.next/` writes mid-scan | A/B tested. Corroborated by `parallel-build-closeout.md`: 214 candidate files + 26 commits, zero findings |
| GitHub Actions minutes exhausted at inventory time; PR #1's PLANS_INDEX freshness job failed in 3 s with zero steps while the same check passed locally (`--check` → OK, exit 0) | `gh run view 40470520525`. Not re-verified since; treat as at-inventory-time |
| STALE: inventory branch was `feat/schema-rls-leak-spine`, PR #1 open → `main`, 28 commits / 186 files | `gh pr view 1`. Current branch is `feat/two-dates-countdown`, stacked on PR #1's branch |

## 1. Tier 1 — platform/console work. Nothing else is schedule-critical.

Sequential dependency: 1.1 → 1.4 → 1.2/1.3. Checklist already written:
`docs/operations/meta-integration-setup-checklist.md`.

| # | Work | Done when | Why it blocks |
|---|---|---|---|
| 1.1 | Oracle VM provisioned (ARM or x86 — decides ffmpeg base image), Cloudflare DNS record, Caddy DNS-01 TLS, compose up, health URL over HTTPS | `curl https://<host>/health` returns 200 from a phone on cellular | 1.2, 1.3, the live demo, and the URL surviving Nov 5–8 |
| 1.2 | Meta Model API: attach card, claim credits, create key, `GET /v1/models` from a ZA account, one real Spark text call, set spend-limit alert | Model list returned; one observed cost; Meta keys present in `.env` (at inventory: none — it held only `DATABASE_URL SESSION_SECRET CIRCLE_BASE_URL DEMO_MODE POSTGRES_* DATABASE_URL_TEST`) | Hard-gates §2 day-3 slice. `client.ts:37` pins `https://api.meta.ai/v1` |
| 1.3 | WhatsApp app + sandbox: test number, webhook verify challenge over public HTTPS, real ogg/opus voice note captured | Verify echo succeeds; one real voice note saved to disk | Day-3 gate is a physical send from a phone; also tests risk-register row 5 |
| 1.4 | Auth template submitted now, so its ≤24 h clock runs overnight | Template in pending on the Meta console | Only day-1 item whose duration can't be shortened; reclassified as utility later would cost marketing pricing |
| 1.5 | Sandbox recipient allow-list probe: can a second real number message the sandbox at all? | Answered yes/no and recorded in the ten-day plan's cast row | Risk-register row 1: a "no" turns the 3-device demo into browser profiles, and that decision must be made day 2, not day 9 |

## 2. Tier 2 — build work with an unmet gate

| # | Work | Gate | Present state (at inventory) |
|---|---|---|---|
| 2.1 | Voice slice E2E: ffmpeg ogg/opus → mono 16-bit PCM 16 kHz WAV against a real voice note, then `muse-voice-transcribe-1.0`, flat `json_schema` extract, draft → owner confirm → active | A voice note from a phone becomes a confirmed item visible on a second device in ~30 s | `intake/voice.ts`, `pipeline.ts:17` (`ffmpegPath`), transcribe path all exist and are unit-tested with fixtures — never against real bytes or a real API |
| 2.2 | Link expansion og:image/og:price:amount + JSON-LD, Spark fallback; claims + pools + contributions with `WHERE status =` guarded transitions; money in minor + ZAR | A pasted Takealot URL yields correct title/price/image without a model call; solo claim and 3-person pool reach funded | `intake/link.ts:18`, `ledger/index.ts` exist; pool inputs still take cents rather than a ZAR amount |
| 2.3 | Owner-blindness audit of every built route + soft delete + "did you buy it yourself?" + `pivot_needed` + per-attribute visibility on the friend sheet | Owner deletes a pooled item → survives for friends with the pool marked; a friend-added item is absent for the owner including in the network response | Attributes and revealed/tombstoned states render in both ledgers; audit pass not run |
| 2.4 | Gift card F10 polish: contributor names + verbatim messages, Anonymous opt-out, URL rejection, Spark pun, SVG→PNG at A6 300 DPI + screen size, optional muse-image background; friend route 404-not-403, no `og:`, private, no-store | A pool member downloads a card naming every contributor; the owner's session gets 404 on the same URL; pasting the circle link into a WhatsApp group containing the owner previews no contributor name | `cards/render.ts` is satori + resvg (no Puppeteer), `cards/validation.ts` present; the real-WhatsApp preview proof has never been run. Re-triaged in `gift-card-f10.md` |
| 2.5 | SAM 3.1 photo → cutout candidates, then the same function for card art, with the person-box pre-check firing before any mask is stored | Fixture set includes a photo with a person and the guard is proven to fire | `vision/index.ts` has `renderMaskedCutout`, `VISION_LIMITS`, `createCutoutExtractor`; no live SAM call |
| 2.6 | WhatsApp task bot: fixed menu first, then the six bounded tasks, inbound router | Fixed menu is the floor; the assistant never chooses a task or changes state | `agent/tasks.ts:5` `FIXED_MENU` + `routeWhatsAppTask`, `dispatch.ts`, `status.ts` exist; needs live webhook round-trips |
| 2.7 | Post-event reveal: date gate + author veto + attribution | — | `revealed` status renders; the reveal flow itself is unbuilt |
| 2.8 | Landing page at `/`, app under `/app`, `/c/<slug>` unmoved | A test asserts `/c/<slug>` still resolves | `src/app/page.tsx` and `src/app/app/page.tsx` exist; decision open: unlisted YouTube vs self-hosted MP4 on the VM |

## 3. Tier 3 — verification, deploy, demo (days 7–10)

| # | Work | Gate |
|---|---|---|
| 3.1 | Complete the leak suite to the full role × query matrix per ARCHITECTURE §8, incl. the agent-context builder assertion and the four card surfaces (route, PNG, cache header, link preview); CI-gating | Green in CI and asserts the role it set |
| 3.2 | Deploy artifacts: Dockerfile (ffmpeg baked in), Caddyfile, compose app + worker services, deploy docs containing no secrets | `docker compose up` on a clean VM serves HTTPS |
| 3.3 | Judge README + fixtures + deterministic demo state + runbook for `down -v && seed`; 9-point pre-recording checklist run and failed on purpose once | The demo path runs twice from a fresh seed with identical results |
| 3.4 | Nightly `pg_dump` actually scheduled on the VM (script exists: `scripts/ops/backup.sh`, `restore.sh`) | A restore of last night's dump is performed at least once |
| 3.5 | Second-device cast decision recorded in the plan file (2 real phones + 1 browser, or owner phone + 2 browser profiles) | Recorded day 7, not day 9 |
| 3.6 | 3-minute video, edited and viewable by a logged-out account; freeze deploys Nov 3 | Visible to a stranger |
| 3.7 | Pre-publication sweep: `git grep -nE '\+27[0-9]{8,9}'`, gitleaks `dir .` with dev server off, secret scan, then flip repo public — needs the user's explicit go-ahead | Clean on all three |
| 3.8 | Submission before 21:00 ET Thu 4 Nov: video, live URL, public repo, contributors listed; claim credits if not already | Confirmed on the Cerebral Valley platform |

## 4. Occupied at inventory time — all resolved since

- Two dates + surprise-safe countdown was running in another agent. **Done:** implemented and
  closed in `birthday-and-event-countdown.md` (430 tests, 12 Playwright flows).
- `prisma/schema.prisma` had an uncommitted modification by another agent, and `6805554`/`b06464b`
  landed mid-session. No worktree was to stage that file. **Resolved:** no schema modification
  is outstanding.
- `docs/diagrams/pinata-customer-journey.drawio` was untracked work belonging to another agent.
- `docs/plans/registry-network-discovery-deviations.md` is draft P3 with an open question; it is
  post-hackathon-shaped, not day-2 work.

## 5. If a gate slips — decided now, not at 2 a.m.

Cut order (first cut first): unanimous early unlock → landing screenshot strip → card-art cutout
→ photo intake beyond one best mask → the reveal → the landing page. Then the plan's own list:
screenshot intake → link Spark fallback → pool funding realism (promised only) → outbound
WhatsApp → attributes beyond the four core sizes → second friend device.

Never cut: the capability gate `can()`, the leak suite, the voice path, the fixed-menu
compliance floor, `/c/<slug>`, the live model call in F2, soft-delete/pivot behaviour, the
public repo with a reproducible README, the recorded video.

Canonical version of this list: `gift-circles-ten-day-build-plan.md` §Cut list.

## 6. Facts the planner must not re-litigate

Marketplace scraping is prohibited (use `web_search` grounding); OTP must be an authentication
template; webhook media IDs expire at 7 days, signed URLs at 5 min → parse-on-ingest; key users
on BSUID with phone fallback; Muse Spark 1.2 for voice-note intake (1.3 is degraded);
`.ogg/opus` must become 16-bit PCM WAV; general AI chatbots are banned on the Business Platform
from 2026-01-15 so the assistant is task-scoped; interactive messages only inside the 24 h
window, ≤3 reply buttons, ≤24 rows; the Meta friend graph is not importable and a BSUID cannot
be reverse-resolved; RLS filters rows, never columns, so projection builders + leak tests are
the column boundary; owner view ≠ friend view, 404 never 403; no unofficial WhatsApp client, no
flag service, no auth framework, no payment integration before submission; card rendering is
satori + resvg, not Puppeteer.

Canonical version: `AGENTS.md` §§Non-negotiable product rules, Verified platform constraints,
Dependency rules.

## 7. Decisions only the user can make

- PR #1: leave it, convert to draft to stop re-firing, or close until Actions minutes return.
- Which §1 item happens tonight — §1.1 and §1.2 in parallel is the best use of an evening.
- Cast for the demo (§3.5), if the §1.5 probe says no.
- Landing-page video host: unlisted YouTube vs self-hosted MP4 (§2.8).
- Go-ahead to flip the repo public (§3.7).

## Next actions from the original inventory

- First two-minute user item: §1.5 — send one message to the sandbox number and record whether
  a second number is accepted, because it decides the demo cast.
- Side quest offered at inventory time: write the Dockerfile, Caddyfile and compose app/worker
  services (§3.2) with no console needed, so §1.1 becomes a single command. Deploy artifacts
  under `docs/deployment/` were in flight in a parallel session at merge time — do not duplicate.
- Low value: a startup check that fails loudly when Meta vars are absent from `.env` — real,
  but it can wait until after the day-3 gate.
