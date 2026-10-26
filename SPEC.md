# Gift Circles — v1 spec (Meta Global AI Developer Hackathon, Indie track)

Locked 2026-10-26. Implementation happens in a fresh session against this file.
Architecture and data model: `ARCHITECTURE.md`. Day-by-day build: `docs/plans/PLANS_INDEX.md`.

## Problem

Group gifting breaks on two things at once. The gift-target either gets asked the awkward "what do you want?"
or receives duplicates and surprises they did not want, because expressing preference kills the surprise. The
friends get the worse problem: a wishlist tool tells them what is wanted but not what other people are already
doing, so two people buy the same helmet, nobody knows the expensive gift is out of reach alone, and the money
coordination happens in off-platform chat where it becomes invisible and awkward.

Existing tools each solve one half. Giftster and PresentSphere do blind wishlists and reservations with no money
coordination. PocketWell and SplitCost do the money with no wishlist or surprise. The gap the brief identified —
and the one worth ten days — is one shared ledger where the owner's view and the friends' view are genuinely
different, and where a group can pool behind a single buyer. Delivery friction is solved by not being an app:
one gated link pasted into the WhatsApp group the friend is already in.

## Success criteria

Verifiable on submission day (2026-11-04):

- **The spine works live on three devices.** Owner, Friend A and Friend B each use their own phone, on the
  fictional seeded cast, with no developer intervention mid-take.
- **Voice note → item.** Owner sends a WhatsApp voice note to the business number; a structured draft item
  (title, price, currency, canonical URL, image) appears in the owner's PWA within ~30 s, and the owner confirms it.
- **Link → item.** A pasted SA retailer URL expands to real title, price and image via `og:*`/JSON-LD, without a
  model call being needed to prove it worked.
- **Photo → item.** A product screenshot uploaded from the phone becomes a draft item through vision.
- **Claim + pool behind one buyer.** Friend A claims an item solo; Friend B and C join a pool on another item with
  one assigned buyer and recorded per-person amounts, and the pool reaches `funded` from real contributions.
- **Owner blindness, demonstrated not asserted.** On the owner's own screen, after all of the above, there is no
  claim, no pool, no contributor, no secret suggestion, and no view count. The leak test suite is green in CI and
  is shown in the video as the proof.
- **Soft delete keeps the money honest.** Owner deletes an item and picks "I bought it myself"; the item vanishes
  from the owner's list but stays in the friends' ledger with its pool marked `pivot_needed`.
- **Secret suggestion.** Friend B adds an item; it appears for friends and never for the owner.
- **Attributes.** Owner's ring/shoe/top size and favourite colour, marked shareable, are visible to friends on the
  item detail screen; a private attribute is not visible to anyone but the owner.
- **Real Meta usage on the critical path.** `muse-voice-transcribe-1.0`, `muse-spark-1.2` (audio+image),
  `muse-spark-1.3` (text) each appear in the ingest log with model name and token counts, so Stage-1 "reasonably
  used Meta models" is evidenced by the product, not by a claim.
- **Deployed and reachable** at the Cloudflare-TLS'd URL on the Oracle VM, still up during Nov 5–8 judging.
- **Repo public**, with a README that lets a judge `docker compose up` and reproduce it.

## Failure criteria

Non-negotiable, in the order I would protect them if the schedule collapses.

- **HARD FAILURE — any privacy leak.** An owner observes a claim, pool, contribution, secret suggestion, viewer
  list, deal price or **gift card** through *any* path (API, agent reply, error message, network response, browser
  cache, **WhatsApp link preview**, Notion doc). Response: **stop all feature work, fix, add the regression test
  that would have caught it, then reassess
  scope.** This outranks shipping features; a leaky registry is not a smaller version of the product, it is a
  different and worse product.
- **HARD FAILURE — no live Meta model in the demo path.** Voice note stays a file, items are typed by hand.
  Stage-1 pass/fail risk. Response: **cut features until the model path is genuinely live** — fewer items, fewer
  flows, real inference.
- **HARD FAILURE — a friend cannot get past the gate in under ~30 s without help.** Response: **degrade to
  pre-seeded sessions + a QR deep link for the recording**; if that fails too, the demo becomes the owner phone
  plus two browser profiles and we say so in the video rather than faking it.
- **SOFT FAILURE — outbound WhatsApp does not deliver** (template rejected, sandbox recipient allowlist, category
  reclassified to marketing). Acceptable for v1: inbound intake carries the WhatsApp story. Response: **degrade to
  in-app nudge badges; show the inbound path only.** Not acceptable: pretending the send worked.
- **SOFT FAILURE — deferred spikes (SAM duplicate detection, `web_search` deals) unimplemented.** Expected and
  documented; not a failure.
- **FALSE SUCCESS — the things that look green but are wrong.** (a) The leak test passes because it queries the
  friend role by accident. (b) Intake "works" because a fixture JSON is loaded instead of a model call. (c) The
  pool shows funded because contributions were seeded, not marked. (d) The demo is recorded against localhost.
  Detection: every ingest row records `model_used` and token counts; the leak suite asserts on the *role* it set,
  not just the absence of rows; the seed script and the live path write different `ingest_events.status` values.
- **DETECTION.** CI runs typecheck + leak suite + view-projection unit tests on every push. A manual 9-point
  checklist is run before recording, and again before submission.

## Decisions & rationale

- **Decision:** v1 scope is the minimal spine — asymmetric ledger (privacy-by-construction) + multimodal intake +
  registry/claims/pools as real CRUD. Deal-finding, the coordination agent, and SAM duplicate detection are
  documented spikes, not scope.
  **Why:** solo developer, 9 remaining days, and a 3-minute video is the primary judging artefact. Five features
  half-built scores zero on Demo (25%) and reads as sloppy on Technical Depth (20%); three features that genuinely
  work score on Impact and are filmable.
  **Alternatives rejected:** *Spine + 2 spikes* — rejected as too much for one person with a hard deadline;
  *everything* — rejected outright; *registry + intake with pooling as a status checkbox* — rejected because the
  competitor research's central finding is that Giftster-class tools stop at reservation, so a checkbox would make
  this a worse Giftster rather than the thing the analysis said was missing.
  **Status:** decided. **Revisit if:** day-3 vertical slice lands early enough to fund another feature.

- **Decision:** privacy is enforced at three layers (Postgres RLS, role-scoped view builder, role-scoped agent
  toolsets), not one.
  **Why:** the product's only claim is owner blindness, and the person most likely to leak it is a solo developer
  on day 8. Redundancy is the feature. It is also what makes the demoable money-shot honest.
  **Alternatives rejected:** *app-layer filtering only* — one forgotten `.select()` leaks and the test suite has
  nothing independent to check against; *separate databases per role* — real isolation but a sync problem you would
  be fighting all week, and it makes the soft-delete/pivot flow much harder.
  **Status:** decided. **Revisit if:** RLS in the ORM fights Prisma connection pooling badly enough to cost days.

- **Decision:** friends pass the gate via owner-managed phone allowlist + session cookie; an authentication
  template OTP is submitted on day 1 and wired **only if** approved.
  **Why:** Meta's docs require an OTP to be a paid *authentication* template (always charged for +27, ≤24 h
  approval, can reject) and the sandbox recipient list is an unverified demo blocker. Allowlist-first means the
  demo never depends on something outside your control, while the template clocks in parallel.
  **Alternatives rejected:** *OTP as the only gate* — highest-risk dependency on day 1; *no gate at all* — breaks
  the privacy premise; *Google OAuth* — abandons the phone-number identity insight that the competitor doc called
  the sharpest architecture choice.
  **Status:** decided. **Revisit if:** the template is approved and the sandbox "Send To" list is confirmed
  permissive, in which case OTP becomes the demo's auth.

- **Decision:** users are keyed on Business-Scoped User ID with phone as fallback, and the allowlist stores a
  **hash** of the phone.
  **Why:** BSUID rollout is documented as gradual through 2026, and once a user enables usernames their phone is
  omitted from webhooks unless you have messaged them in 30 days — a registry keyed only on +27 silently loses
  people. Hashing keeps real numbers out of a public repo.
  **Alternatives rejected:** *phone as primary key* — the failure is silent and post-demo; *email invites* —
  re-introduces the app-download-style friction the whole concept exists to remove.
  **Status:** decided. **Revisit if:** never for the key; the hash scheme is revisited if it complicates the
  allowlist UX.

- **Decision:** intake produces a **draft** item requiring one-tap owner confirmation; a model never commits an
  item on its own.
  **Why:** prices and titles are exactly what a vision model hallucinates, and a wrong price propagates into pool
  maths. One confirm step is also the most legible thing to film: "the model guessed, here, tap yes."
  **Alternatives rejected:** *auto-commit* — faster code, unverifiable product; *full manual review queue* — a UI
  you don't need for 10 items.
  **Status:** decided. **Revisit if:** never during the hackathon.

- **Decision:** link expansion uses our own HTTP fetch of the **user-supplied** URL, reading `og:image`,
  `og:price:amount` and schema.org `Product`/`Offer` JSON-LD. No Marketplace, no scraper dependency.
  **Why:** Meta's Automated Data Collection terms prohibit programmatic collection of Meta product data without
  written permission and no third-party Marketplace search API exists (Content Library is academic-only), so the
  handover's deal-finding plan would have triggered two disqualification rules at once. A user-directed fetch of a
  retailer page the user pasted is a different thing entirely and is clean.
  **Alternatives rejected:** *Marketplace scraping* — disqualifying; *Meta Content Library* — ineligible;
  *SerpApi/Brave* — same-day keys and legitimately licensed by the provider, but a paid dependency and a second
  integration for a feature that is now deferred; *Google Custom Search* — closed to new customers; *Bing* —
  retired 2025-08-11; *Amazon PA-API* — weeks of lead time.
  **Status:** decided. **Revisit if:** deal-finding is resurrected as a spike, where SerpApi becomes the fallback.

- **Decision:** features are described as "searches the open web for better deals", never "searches Marketplace".
  **Why:** accuracy matters to judges who work at Meta, and the Marketplace claim is the one that implies ToS
  breach. **Alternatives rejected:** keeping the original wording — a disqualification risk dressed as a tagline.
  **Status:** decided. **Revisit if:** never.

- **Decision:** ASR-first voice path (`ffmpeg ogg/opus → mono 16-bit PCM 16 kHz WAV` → `muse-voice-transcribe-1.0`
  → `muse-spark-1.2` + `json_schema`) rather than sending audio straight to Spark.
  **Why:** the transcribe endpoint has a hard format requirement, so the conversion exists either way; a stored
  transcript is auditable, is cheap to show in the UI (good demo texture), and costs $0.18/hour versus audio tokens.
  Also dodges the documented warning that **Spark 1.3 audio understanding is degraded**.
  **Alternatives rejected:** *Spark 1.2 audio direct* — one fewer hop, but no transcript artefact and worse cost
  behaviour on retries; *Whisper/third-party ASR* — forfeits the Meta-tooling score on the headline feature.
  **Status:** decided. **Revisit if:** transcript quality on SA accents is unusable, then try Spark 1.2 audio.

- **Decision:** attributes (ring/shoe/top/bottom size, favourite colour) are owner-authored with per-attribute
  `private | friends` visibility, defaulting to private, and are stored on the user rather than the circle.
  **Why:** the owner is the data subject, which makes POPIA consent trivially true and removes the inversion where
  friends accumulate measurements about someone behind their back. Storing on the user makes them reusable across
  occasions, which is the product's persistence argument.
  **Alternatives rejected:** *friend-recorded hidden attributes* — genuinely matches how friends behave ("she
  mentioned size 6"), but holds personal data about the owner without their knowledge, in a product whose whole
  premise is the owner's right not to know; deferred. *Never show raw attributes, agent answers "will it fit"
  only* — least exposure and very AI-native, but it depends on the coordination agent we just cut.
  *Body measurements as free text* — the sensitive-data category balloons for no demo benefit; sizes only.
  **Status:** decided, with friend-recorded attributes deferred. **Revisit if:** real users demand it post-hackathon.

- **Decision:** hosting is the Oracle Always Free Ampere VM with Docker Compose (app + Postgres + Caddy), not
  Vercel/Neon, Cloud Run or Render.
  **Why:** the workload needs RLS-capable Postgres, ffmpeg in the runtime, a webhook that never cold-starts, and
  continuous uptime through Nov 5–8 judging — all while costing nothing. Vercel Hobby is licensed for
  non-commercial use and Neon's free tier suspends after inactivity; Render sleeps 15 minutes; Cloud Run needs a
  billing account and its cold start hits the first webhook after quiet.
  **Alternatives rejected:** those three, plus *local-first deploy-on-day-6* — which concentrates all infra risk
  into the week you can least afford it.
  **Status:** decided. **Revisit if:** the VM turns out not to be reachable or Docker-less on day 1, in which case
  the fallback is a temporary tunnel **for development only** and the submission still runs on the VM.

- **Decision:** demo cast and data are entirely fictional, seeded by script, using real SA retailer product URLs.
  **Why:** the repo must be public and open-source, so committing real names, phone numbers or gift conversations
  would be a POPIA problem created by the submission itself. A seed script also makes the video re-shootable,
  which matters when recording is on day 9.
  **Alternatives rejected:** *real people, real data* — as above; *real consenting friends* — a consent record and
  a deletion obligation carried through a hackathon for no scoring gain.
  **Status:** decided. **Revisit if:** never for the public repo. (One real circle may be run privately as
  evidence of traction, with nothing from it committed.)

- **Decision:** stack is Next.js App Router + TypeScript + Prisma + Postgres 16 + pg-boss, deployed as a single
  image plus a worker.
  **Why:** one language across web, webhook and ingest; Prisma migrations make the schema the documented artefact;
  pg-boss keeps the job queue inside Postgres so there is no second infrastructure piece to install and babysit.
  **Status:** **provisional** — carried from the recommendation, not separately confirmed. Say so on day 1 if wrong.

- **Decision:** the **group gift card** (F10) is in v1: when a pool is `purchased` or a claim is fulfilled, the
  gifters get a printable card carrying the item, a Spark-generated pun, and **every contributor's first name with
  their own message**. Text is rendered deterministically by us (SVG → A6 print PNG at 300 DPI and a screen PNG);
  `muse-image` supplies only a background/object illustration layer and is never load-bearing for correctness.
  **Why:** the ledger tracks the gift but nothing is *handed over* — the card is the artefact that closes the loop
  the origin transcript describes ("takes the awkwardness out of asking"), it is the closing beat the 3-minute demo
  lacks, and it adds a fourth Meta surface for the tooling score at roughly half a day.
  **Alternatives rejected:** *generating a portrait of the recipient from their public profile photo* — fetching
  Meta-platform profile data programmatically is the same Automated Data Collection clause that ruled out
  Marketplace scraping (a stated disqualifier), plus consent and POPIA on a real identifiable person; *a
  contribution card showing amounts* — turns a keepsake into a financial document and nobody asked for it;
  *letting the model typeset the card* — text fidelity in generated images is unverified and an unprintable typo in
  a printed card is a visible failure; *skipping the card* — leaves the product as a spreadsheet.
  **Status:** decided. **Revisit if:** day 7 gates are not all green, in which case the card drops to the cut list —
  it is the only optional feature on the "light days", and the pun/copy must still ship if the renderer does not
  (a text-only card is honest; an empty card is not).

- **Decision:** **the reveal is a human act.** The system generates the card and never delivers it: no send to the
  recipient, no notification to the owner, no `og:` preview and no shared cacheable response on any card route.
  **Why:** the gated circle link lives in a WhatsApp group that *contains the owner*. A link-preview image built
  from contributor names would be rendered by WhatsApp **to the owner**, outside every control we have — RLS, view
  builder and agent scoping all assume our own response is the only carrier. This inverts the obvious choice from
  the design pass (make the card the link preview because it is a beautiful share artefact) because the audience
  of a group preview is the whole group.
  **Alternatives rejected:** *card as OG preview image* — leaks by design; *system sends the card to the recipient*
  — destroys the surprise the product exists to protect; *403 for the owner on card routes* — a 403 confirms the
  card exists, which is itself the leak, so the answer is 404.
  **Status:** decided. **Revisit if:** never; if a share feature is wanted later it must be an explicit gifter
  action on a flattened image, not a server-rendered preview.

### Rollback path (per state-changing operation)

- **Deploy:** tagged images; rollback = `docker compose up -d app:<previous-tag>`. No redeploy rebuild.
- **DB migration:** Prisma migrations are **never** auto-rolled-back in prod. Recovery = redeploy previous image
  (code that matches the older schema) + `pg_restore` of the most recent nightly dump. Nightly `pg_dump` is a
  day-2 prerequisite, not a day-8 one. Migrations are written expand-only (add columns, don't drop) during the
  hackathon so an older image still runs against a newer schema.
- **RLS policy change:** policies live in versioned SQL under `server/db/` and are re-applied idempotently; rollback
  is re-applying the previous file. The leak suite must pass before any policy merges.
- **WhatsApp template:** if a submitted template is rejected or reclassified, sending falls back to the
  in-window free-form reply path and in-app badges. No schema impact.
- **Seed/demo data:** the fictional cast is generated by an idempotent seed script into a disposable database, so a
  corrupted demo state is `docker compose down -v && seed`, never a repair.

### Deploy order / cutover

Day 1: DNS record → Caddy (TLS must validate before anything else) → Postgres container → app container.
Day 2: webhook endpoint registered with Meta **only after** the URL returns a valid `hub.challenge` verify over
HTTPS; then inbound; then send.
Day 3: vertical slice recorded as a screen capture, which doubles as the day-9 demo insurance file.
Every later change: staging = the same VM on a second compose project and a second path prefix, verified before
promoting. There is no dual-write window; the single Postgres is the source of truth and nothing else holds state.
**Freeze deploys after Nov 3.** Submission artifacts (video, repo, live URL) are cut from the Nov 3 build.

### Idempotency / dedup strategy

- **Webhook redelivery is assumed, not exceptional.** `ingest_events.wa_message_id` is `UNIQUE`; a duplicate
  delivery is a no-op that returns 200 so Meta stops retrying.
- **Media fetch is retried immediately** because the signed URL is valid only 5 minutes and the webhook media id
  dies at 7 days; bytes are stored on success and the job records `media_path`, so a re-run reuses bytes instead of
  re-fetching an expired id.
- **Model calls are idempotent by job key** (`ingest_event id + stage`), with the parse result written to `draft`.
  A retried Spark call that returns a different answer must not create a second item — the item is created only on
  confirm, and confirm is a single guarded transition.
- **Claim/pool writes use explicit state transitions**, not read-modify-write: `claimed → fulfilled` and
  `open → funded → purchased` each update `WHERE status = <expected>`, so a double tap cannot double-count money.
- **Seed script is idempotent** by deterministic slugs/ids on the fictional cast.

## User flows

### F1 · Owner creates a circle (PWA)
1. Owner opens the app, sets display name, creates circle (name, occasion, date).
2. App generates `share_slug`; owner sees one gated URL and a QR.
3. Owner pastes the URL into their existing WhatsApp group. *No API involved — this is why the Groups API is out.*
4. Owner adds friends' numbers to the allowlist; each is stored hashed with status `pending`.

### F2 · Owner adds a want by voice note (the headline)
1. Owner sends a voice note to the business number: "I'd love the Specialized Torch cycling shoes, size 43."
2. Webhook receives `audio`, dedupes on message id, immediately downloads bytes (5-minute URL).
3. Job converts `ogg/opus` → mono 16-bit PCM 16 kHz WAV, calls `muse-voice-transcribe-1.0`, records the transcript.
4. `muse-spark-1.2` extracts `{title, brand, size, price_minor, currency, canonical_url_guess}` via flat
   `json_schema`.
5. Draft appears in the owner's PWA with a "confirm / edit" card; owner taps confirm.
6. Item is `active, visibility=owner_visible`. Friends now see it. Owner sees no claim state ever.

### F3 · Owner adds by link / screenshot
Same pipeline; link path fetches the user-supplied URL and reads `og:*` + JSON-LD first, falling back to Spark only
when metadata is missing. Screenshot path goes straight to Spark vision.

### F4 · Friend joins and views
1. Friend taps the link on their phone, enters their number.
2. Hash matches an `accepted` allowlist entry → session created (OTP if the template got approved).
3. Friend sees `friend` projection: all `owner_visible` items **plus** friends' secret suggestions, claims, pools,
   contributor amounts, and the owner's shareable attributes on the item sheet.

### F5 · Friend claims solo
1. Friend taps Claim → `claims(kind=solo)`; the item shows "claimed by Thabo" to friends, nothing to the owner.

### F6 · Friends pool behind one buyer
1. Friend A starts a pool on an expensive item, sets `target_minor`, becomes `buyer_user_id`.
2. Friends B and C add `contributions` (`promised`, then `marked_paid` when they settle privately).
3. When `sum(marked_paid) >= target_minor`, pool → `funded`. Buyer sees a single "I bought it" action → `purchased`
   and each contribution `settled`.
4. Owner's view of that item never changes from "active, wanted".

### F7 · Secret suggestion
1. Friend B adds "cycling shoes actually come in 44, she said 43 might be tight" as an item.
2. `visibility = friend_only`. Invisible to the owner forever unless revealed post-event.

### F8 · Owner soft-deletes (the money-honest edge case)
1. Owner taps Delete, then answers "did you buy it yourself?"
2. `bought_self` → item `tombstoned` for the owner, still readable to friends; any pool on it → `pivot_needed`, and
   friends see "Nadia bought this — move the money".
3. `no_longer_wants` → same tombstone, pool → `pivot_needed` with a different label.

### F9 · Nudge (degraded form, since the agent is cut)
In-app badge on `open` pools with unmet contributions. Outbound WhatsApp send exists behind a flag only if the
template approves and the sandbox lets it through.

### F10 · The card is downloaded and handed over (the closing beat)
1. Pool reaches `purchased` (or a solo claim is fulfilled). Nothing is sent to the owner about it.
2. Any contributor opens the card route from the item sheet. **Friend role only.** An owner session gets 404.
3. Each contributor writes their own one-line message (≤200 chars, URLs rejected) and chooses show-first-name or
   `Anonymous`. No amounts appear. Their own line is previewed before it is committed.
4. Spark proposes the pun from (item title, recipient first name, occasion) via a flat `json_schema`
   `{pun, one_line, alternate}`; the buyer picks one. Model output is copy, never layout.
5. The renderer composes text + optional `muse-image` background → A6 print PNG (300 DPI, bleed) and a screen PNG.
   Both are served from the authenticated friend route with `Cache-Control: private, no-store` and **no `og:` tags**
   — see "Reveal is a human act".
6. The gifter downloads and sends or prints and attaches it. The reveal happens off-platform, by hand.
7. If the item was tombstoned but the pool funded anyway, the card still renders: the ledger survives the delete,
   so the keepsake survives it too.

## Out of scope for v1

Holding money, escrow, Stripe Connect, KYC. Native iOS/Android. Facebook/Messenger/Instagram surfaces. Facebook
Login. Marketplace scraping in any form. The coordination/nudge **agent** (pool maths and state are in; LLM
negotiation is not). SAM 3.1 duplicate detection. `web_search` deal-finding. Post-event reveal. Public discovery of
strangers by phone number, and the contact-sync mitigation the competitor doc suggested — both deferred, because
public lookup is a scraping surface we don't need for a gated-circle demo. Multi-currency beyond ZAR. Real user
accounts, password login, email. Search, filters, analytics dashboards. Mobile-app install flows. Automated
template re-rolls after rejection.

## Open questions

- [TODO: needs confirmation] Framework — Next.js App Router + Prisma was carried as the recommendation, not
  separately agreed. Cheap to change only before day 2.
- [TODO: needs day-1 check] Does the Oracle VM currently have Docker, an Elastic IP, and 443 open, and is a domain
  pointed at it? Nothing later blocks on it, but day 1 does.
- [TODO: needs day-1 check] Are recipients restricted to a console "Send To" allowlist for the sandbox number? This
  is the single most likely thing to break the 3-device demo.
- [TODO: needs day-1 check] Can `GET /v1/models` return a non-empty list from a South African account, and does a
  `web_search`-grounded call succeed? Determines whether the deferred deal spike is ever viable.
- Are two more willing friend-co-actors available by day 7, or does the recording use the owner phone plus two
  browser profiles? Decide on day 7, not day 9.
- Does the business number (+27 60 …) belong to a WhatsApp Business App account that cannot coexist with the Cloud
  API sandbox? Verify before promising the 3-device story; if it conflicts, the demo uses the sandbox number only.
  **Real numbers stay out of the repo regardless.**
- Is a `muse-image-1.0`-generated registry cover image worth the 150 RPM budget for the Best Creative Build angle?

## Implementation steps

Ordered; each phase ends with something demonstrable. Details and daily gates in `docs/plans/`.

1. **Infra spine (day 1).** Cloudflare record → Caddy TLS-01 → compose up (Postgres, app) → health endpoint.
   Attach card to Meta Model API, claim credits, create key, `GET /v1/models`. Create Meta app + WhatsApp sandbox,
   register webhook verify. Submit authentication template. Public GitHub repo + CI.
2. **Schema + RLS (day 2).** Prisma models for the tables in §4, expand-only migrations, nightly `pg_dump` script,
   RLS policies + `SET LOCAL ROLE`, seed script for the fictional cast. **Write the leak suite skeleton here, not
   later — it defines the schema's correctness.**
3. **Gate + membership (day 2).** Allowlist hashing, session cookie, owner/friend route split by role.
4. **Webhook + ingest (day 2–3).** Verify, dedupe, media download to disk, pg-boss job, status transitions.
5. **Voice path (day 3 — the slice).** ffmpeg, transcribe, Spark 1.2 + flat `json_schema`, draft → confirm → item.
6. **Link + screenshot paths (day 3–4).** `og:*`/JSON-LD extractor, vision path, confirm UI.
7. **Claims + pools + contributions (day 4).** State transitions with `WHERE status =` guards.
8. **Soft delete + pivot (day 5).** "Did you buy it yourself?" and the friends' surviving ledger.
9. **Secret suggestions (day 5).** `friend_only` items and the reveal flag.
10. **Attributes (day 5–6).** Owner-authored, per-attribute visibility, rendered on the friend item sheet.
11. **Gift card (day 5–6, F10).** Contributor message + name capture (per-contributor, opt-out to `Anonymous`,
    URLs rejected), Spark pun via flat `json_schema`, SVG→PNG renderer at A6 300 DPI and screen size, optional
    `muse-image` background layer. Friend-role route, 404 for owner, no `og:` tags, `private, no-store`.
12. **Leak suite completion (day 7).** Role × query matrix per ARCHITECTURE §8, CI-gating, plus the agent-context
    assertion and the card-surface rows (route, PNG, cache header, preview).
13. **Polish, fixtures, screenshots (day 7–8).** Public README, LICENSE, deploy docs with no secrets.
14. **Record (day 9).** 3-minute video from the checklist; freeze deploys Nov 3.
15. **Submit (day 10).** Video, live URL, public repo, all contributors listed.

## Guardrails

- Only two real failure states exist: a privacy leak, and no live Meta model in the demo. Everything else is
  negotiable; those two are cut-list-inverted, meaning features go **before** the leak suite or the model path.
- No feature ships without declaring which projection renders its data. New column ⇒ new `owner_visible |
  friend_only` decision, in writing, in the migration comment.
- Every live API call gets a deterministic fallback path before it appears in the demo script.
- No real names, phone numbers, or gift conversations in any committed file, fixture, screenshot or video.
- The demo is recorded from the deployed URL, never from localhost, or it doesn't count.
