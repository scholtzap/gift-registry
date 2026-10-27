---
title: Gift Circles ten-day build plan
type: spec
status: implementing
priority: P1
rank: 1
updated: 2026-10-26
apps: []
related: [SPEC.md, ARCHITECTURE.md]
evidence: SPEC.md
archived_date: null
supersedes: null
superseded_by: null
---

# Gift Circles — ten-day build plan (Oct 26 → Nov 4 2026)

**Status:** Active. Gates are the contract; if a gate fails, apply the cut list rather than absorbing the slip.

**Progress (26 Oct, part of days 1–2):** all §4 tables in Prisma with two expand-only migrations; `app_owned` /
`app_friend` roles and the policy set; `withActor` as the only door to friend-scoped data; fictional-cast seed;
`GET /health` that answers 500 when a table has no policy; leak suite green on 10 assertions, 7 of them proven red
first; owner and friend **projection builders** with 5 shape assertions (`pnpm leak` = 15 green, committed
`9d61268`). Still open on day 1: VM, TLS, Meta key, WhatsApp webhook verify, auth template. Still open on day 2:
nightly `pg_dump`, session cookie, role-split routes, ingest webhook + dedupe.

Deadline **Wed 4 Nov 21:00 ET**. Nine usable days after today. Solo. Judging uses a 3-minute video, the public
repo, and the live product, and top-5 teams have judges watching the video **live** on Nov 9, so the URL must
survive Nov 5–8.

Working day assumption: 6–8 focused hours, with Oct 31 and Nov 1 as deliberately lighter days. Every day ends
committed and pushed, per the repo hygiene rule.

| Day | Date | Build | Exit gate — do not proceed until true |
|---|---|---|---|
| 1 | Mon 26 Oct | **Unblock everything external.** Cloudflare record → VM; Caddy DNS-01 TLS; compose up (Postgres, app, worker) on a hello-world; health URL over HTTPS. Meta Model API: attach card, claim credits, create key, `GET /v1/models`, one Spark text call, set a spend-limit alert. Meta app + WhatsApp sandbox: get the test number, register the webhook **verify** challenge. Submit the authentication template now so its ≤24 h clock runs while you sleep. Public GitHub repo, CI green, Notion sync fires once. | `GET /v1/models` returns models **from a ZA account**; webhook verify passes over public HTTPS; template submitted; one real text-completion cost observed. |
| 2 | Tue 27 Oct | Schema (all §4 tables) + expand-only migrations + RLS policies + `SET LOCAL ROLE`; nightly `pg_dump` script; fictional-cast seed script; **leak suite skeleton** with the first two assertions. Allowlist hashing + session cookie + role-split routing. Webhook: dedupe, signature check, media download to disk, pg-boss job + status transitions. | A seeded owner and two seeded friends render different projections of the same rows, and the leak suite's first test fails *before* you write the policy, then passes after. |
| 3 | Wed 28 Oct | **Vertical slice.** ffmpeg `ogg/opus → mono 16-bit PCM 16 kHz WAV`; `muse-voice-transcribe-1.0`; flat `json_schema` extract on `muse-spark-1.2`; draft card → owner confirm → `active` item; item visible in friend projection. | A voice note sent from your phone to the sandbox number becomes a confirmed item visible on a second device within ~30 s. **If this gate misses by end of day 3, cut the screenshot path and the link path to day 5 minimum-viable and protect the slice.** |
| 4 | Thu 29 Oct | Link expansion (`og:image`/`og:price:amount` + JSON-LD `Product`/`Offer`, Spark fallback). Claims + pools + contributions with `WHERE status =` guarded transitions. Money shown in `minor` + ZAR. | A pasted Takealot URL yields a correct title/price/image **without** a model call; a solo claim and a 3-person pool with one assigned buyer reach `funded`. |
| 5 | Fri 30 Oct | Soft delete + "did you buy it yourself?" + `pivot_needed`. Secret suggestions (`friend_only`). Owner-blindness audit of every route you have built. Attributes: owner-authored, per-attribute visibility, rendered on the friend item sheet. | Owner deletes a pooled item → still present for friends with the pool marked; a friend-added item never appears for the owner in any view **including the network response**. |
| 6 | Sat 31 Oct | Lighter day. **Gift card (F10):** contributor name + message capture (own preview, `Anonymous` opt-out, URLs rejected, no amounts), Spark pun via flat `json_schema`, deterministic SVG→PNG render at A6 300 DPI + screen size, optional `muse-image` background. Friend-role route, 404 not 403 for the owner, no `og:` tags, `private, no-store`. Then confirm/screenshot UI polish, empty and error states, mobile viewport on a real phone. | A pool member downloads a card naming every contributor with their own message; the owner's session gets 404 on the same URL; **pasting the circle link into a real WhatsApp group while the owner is in it produces a preview that contains no contributor name.** If the day collapses, ship the text-only card and drop the generated background. |
| 7 | Mon 1 Nov | Lighter day. **Second-device reality check:** decide the cast (2 real phones + 1 browser, or owner phone + 2 browser profiles). Complete the leak suite: role × query matrix per ARCHITECTURE §8 including the agent-context builder assertion **and the four card surfaces (route, PNG, cache header, link preview)**. Optional 4-hour spike on a deferred item only if every gate above is green. | Leak suite is green in CI and asserts the role it set. Cast decision recorded here, not on day 9. |
| 8 | Tue 2 Nov | Feature freeze in practice. **Judge README** (`docker compose up` → seeded demo), fixtures, deterministic demo state, runbook for `down -v && seed`, deploy docs containing no secrets. Run the 9-point pre-recording checklist and fail it on purpose once to prove it catches things. | The demo path runs twice in a row from a fresh seed with identical results. |
| 9 | Wed 3 Nov | **Record the 3-minute video.** Freeze deploys. Last day for hackathon technical questions — ask in #office-hours today, not Nov 4. | Video edited and viewable by a logged-out account. Repo, README, LICENSE, live URL all reachable by a stranger. |
| 10 | Thu 4 Nov | Submit before 21:00 ET: video, live URL, public repo, contributors listed. Do not touch code. Claim credits if not already claimed. | Submission confirmed on the Cerebral Valley platform. |

## v1.1 amendment (26 Oct, second interview round)

Six new workstreams, each with its own plan file and its own cut line. **They add roughly 3.5 days to a 9-day plan
that was already full**, so the day mapping below is a dependency order, not a promise — and the cut order is decided
now rather than at 2 a.m. on day 8.

| Lands | Workstream | Plan file |
|---|---|---|
| day 3, **before** the voice path is written | Entitlements + the single `can()` gate, retrofitted onto the three existing model paths | `entitlements-and-capability-gate.md` |
| day 4 (half day) | Stitch brand round → `DESIGN.md` → Tailwind tokens | `design-system-and-brand.md` |
| day 4–8, incremental | Screens built styled, no end-of-project styling pass | `design-system-and-brand.md` |
| day 6–7 | SAM 3.1 photo → cutout candidates, then the same function on the card | `vision-cutout-intake.md` |
| day 6–8 | WhatsApp task-bot: fixed menu first, then the six bounded tasks | `whatsapp-task-bot-surface.md` |
| day 8 | Post-event reveal (date gate + author veto + attribution) | `post-event-reveal.md` |
| day 8 | Public landing page at `/`, app under `/app`, `/c/<slug>` unmoved | `public-landing-page.md` |

**Cut order (first cut first):** unanimous early unlock → landing screenshot strip → card-art cutout → photo intake
beyond one best mask → the reveal → the landing page. **Never cut:** the capability gate, the leak suite, the voice
path, the fixed-menu compliance floor, `/c/<slug>`.

`ARCHITECTURE.md` §3 gains rows for the gate, the vision pipeline and the inbound router **when those modules
exist**, not before — a map of planned code is how a map becomes a lie.

## Risk register

Ordered by (probability × damage). The top three are the ones that actually kill hackathon projects.

| Risk | Why it bites | Mitigation | Kill trigger |
|---|---|---|---|
| **Sandbox recipients restricted** to a console allow-list, or the second number can't reach the sandbox at all | The 3-device demo silently becomes screenshots | Test on **day 1**, not day 7. Browser profiles as co-actors from the start. Pre-seed sessions | Day-1 check fails → declare the degraded cast on day 2 |
| **Meta Model API unavailable / unpaid / geo-limited from ZA** | Stage-1 pass/fail depends on reasonable Meta model use | Card attached day 1, credits claimed day 1, `GET /v1/models` day 1, spend cap alert set so a runaway loop can't exhaust it | Day-1 text call fails → ask in #office-hours that day; nothing downstream is built on audio until this works |
| **Privacy leak** — the product's only claim | A leak isn't a smaller product, it's a different and worse one | Three independent enforcement layers, leak suite written **with** the schema on day 2, audit day 5, CI-gating day 7 | Any leak found → stop features, fix, add the test |
| **Card names leak through a WhatsApp link preview** | The circle link lives in a group that contains the owner, so anything preview-rendered for that link is rendered *for the owner*, past every app-layer control | No `og:` tags or cacheable responses on card routes (day 6); explicit preview row in the leak matrix (day 7); reveal is a human act, never a send | Owner-visible name in any preview → hard failure, treat as the privacy row above |
| ffmpeg on ARM / audio format mismatch | `muse-voice-transcribe-1.0` accepts only RIFF/WAVE mono 16-bit PCM 16/24 kHz; WhatsApp sends `ogg/opus` | Bake ffmpeg into the image day 1; test against a **real** WhatsApp voice note, not a synthetic file | Day 3 gate slips → fall back to Spark 1.2 audio direct, keep the transcript UI |
| Authentication template rejected or reclassified | OTP is always charged for +27 and approval can take 24 h and can reject | Allowlist-first auth; OTP is an upgrade, not a dependency | Rejected → ship allowlist-only, mention OTP as designed-not-enabled |
| Pooling nudge reclassified **marketing** | Immediate reclassification if previously warned; marketing is priced and rate-limited hardest | Keep sends tied to a user-created item, inside the 24 h window where possible; else in-app badges | Reclassified → drop outbound sends entirely |
| Webhook media id expires at 7 days, signed URL at 5 min | A lazily-parsed item becomes unparseable before demo day | Parse-on-ingest, store bytes immediately, record `media_expires_at` | Observed expiry in dev → shorten the queue drain interval |
| Recursive `json_schema` returns HTTP 400 | Costs an afternoon of blaming the API | Flat schemas from day 3, asserted by a unit test on the schema itself | — |
| VM down during judging Nov 5–8 | Demo 25% goes to zero | Freeze deploys Nov 3, nightly dump, one-command restore, and the video as the artefact that must survive regardless | — |
| Free-tier credit exhausted or card issue | Mid-project outage | $150 credit + spend-limit notification; SAM and `muse-image-1.0` (150 RPM) are off the critical path | — |
| Real personal data in a **public** repo | POPIA exposure created by the submission itself | Fictional cast only, hashed phone allow-lists, pre-commit secret scan | Any real number found → purge from history before making the repo public |
| Solo scope creep | Five half-features score worse than three finished ones on both Demo and Technical Depth | Gates above; cut list below; deferred spikes have their own doc | Any day ending with its gate unmet → cut, don't extend the day |

## Cut list — in this exact order, if behind

1. **Screenshot intake.** Link + voice already carry the multimodal story; vision-on-screenshot is the least
   load-bearing of the three intake paths.
2. **Link expansion fallback to Spark.** Keep the deterministic `og:*`/JSON-LD path only; drop the model fallback.
3. **Pool funding realism.** Ship `promised` state only; drop `marked_paid` / `settled` bookkeeping and say so.
4. **Outbound WhatsApp entirely.** Inbound intake is enough of the WhatsApp story; sends are the riskiest surface.
5. **Attributes beyond the four core sizes.** Drop free-text colours, keep ring/shoe/top/bottom.
6. **Second friend device.** Two browser profiles, clearly labelled in the video as a demo constraint.
7. **Anything that isn't flow F2, F4, F5, F6, F8.** These five are the product; F2 is the demo's spine.

**Never on the cut list:** the leak suite, the live model call in F2, the soft-delete/pivot behaviour, the public
repo with a reproducible README, and the recorded video.

## Post-hackathon (not scope)

Deferred spikes in `docs/strategy/investigations/deferred-spikes.md`; then Stripe Connect escrow against the
ledger that is already shaped for it, friend-recorded attributes with a consent flow, post-event reveal, and
`Login with WhatsApp` if it ever reaches +27.
