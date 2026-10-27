# Gift Circles — v1 spec (Meta Global AI Developer Hackathon, Indie track)

Locked 2026-10-26. Implementation happens in a fresh session against this file.
Architecture and data model: `ARCHITECTURE.md`. Day-by-day build: `docs/plans/PLANS_INDEX.md`.

**Amended 2026-10-26 (v1.1)** after a second interview round. Added: the per-user AI-capability gate
(free/premium foundation), the photo → cutout vision path on SAM 3.1, the bounded WhatsApp task-bot
surface, the design system and brand round, the post-event reveal, and a public landing page.
New decisions are marked **v1.1**; new flows are F11–F15; new build steps are 16–22. Nothing in the
original v1 spine was weakened by this amendment — the two non-negotiable failure states (a privacy
leak, no live Meta model in the demo) still outrank every feature added here.

**Amended 2026-10-26 (v1.2)** after a third round, on identity, the path to paid, and which open
source to adopt. No new features and no new flows: this round decides what **not** to build, and
records the seams that keep the post-hackathon work additive. F4 is corrected to match the gate
that was built. New decisions are marked **v1.2** and are summarised in §Decisions; the full
rationale, every rejected alternative and all sources are in
`docs/plans/user-management-and-billing-path.md`.

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

Added by the v1.1 amendment — each is observable in the 3-minute video, not just present in code:

- **A branded product, not a bootstrap scaffold.** `DESIGN.md` plus one committed Tailwind token set
  (colour, type scale, spacing, radii, component states) render the seven in-app screens and the
  landing page consistently; the video shows at least three of them and the screenshot strip on the
  landing page matches what the app actually looks like.
- **Photo → cutout candidates.** One user-submitted photo containing two or more gifts yields at least
  two transparent-background cutouts via `sam-3.1`, each landing as its own confirmable draft item with
  the cutout as its image. The ingest row records `model_used = sam-3.1`.
- **The same cutout code closes the loop on the card.** The gift card renders the product cut out of its
  own image, placed on the card art — one pipeline, two visible payoffs.
- **Capability switches are real and demoable.** At least one seeded user has a capability OFF and takes
  the degraded manual path on camera; the switch screen lists every model-spending capability by name.
  A missing entitlement row fails **closed**, and a test asserts it.
- **The assistant stays inside its task set.** In WhatsApp it handles exactly the six bounded tasks and
  answers anything else with the same fixed menu; the join page and the first reply both label it as AI.
  No free-form conversation exists anywhere in the product.
- **Post-event reveal works and stays honest.** After `event_date`, a friend reveals a secret suggestion;
  it enters the owner projection with `revealed_by` attribution in the ledger, no notification is sent,
  and an item the author flagged `reveal_ok = false` never becomes owner-visible.
- **The public landing page is live at `/`** with the story, the screenshot strip and the demo video
  embed, and it renders no circle data at all.

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

Added by the v1.1 amendment:

- **HARD FAILURE — a model call runs for a user who switched that capability off.** This is a consent failure,
  not a billing one, and in a product whose whole pitch is "the system never shows you what you did not agree to"
  it undercuts the core claim. Response: **refuse the call, log the attempt, add the regression test that would
  have caught it, then reassess scope.** Same cut-list-inverted status as a privacy leak.
- **HARD FAILURE — a cutout contains a person.** A face, a body, a hand holding the product, or any pixel from a
  photo the uploader did not supply. Response: **refuse to render the cutout, keep the source photo, escalate.**
  The pre-check that catches this (a Spark vision pass returning person boxes) is part of the pipeline, not a
  later refinement, and the fixture set must include at least one photo with a person in it so the guard is proven
  to fire.
- **HARD FAILURE — the assistant replies free-form or off-task in WhatsApp.** Meta's Business Solution Terms ban
  general-purpose AI chatbots on the Business Platform from 2026-01-15, immediately for accounts registered after
  2025-10-15 — ours will be new — and the hackathon disqualifies projects that violate platform policies.
  Response: **stop, remove the generative reply path, ship the fixed menu.**
- **HARD FAILURE — design work is still open at the day-7 leak gate.** Response: **roll back to the token set
  only** (palette, type, spacing applied to unstyled-but-correct screens) and let the video carry the product
  story rather than the polish.
- **SOFT FAILURE — vision yields one candidate where the photo held three.** Acceptable for v1: degrade to
  single-item intake and say so in the video. Not acceptable: silently presenting the one cutout as "the items in
  your photo".
- **SOFT FAILURE — unanimous early-unlock does not ship.** The date gate alone satisfies the product promise;
  early unlock is a convenience. Cut it at the day-7 gate without discussion.
- **FALSE SUCCESS additions.** (e) "The toggle works" because the gate defaults to ON when the entitlement row is
  missing — the gate must fail closed and a test must assert the missing-row case. (f) The landing page is
  "static" but queries a circle to render an example — it must render zero circle data. (g) The reveal "works"
  because the test set the item to `revealed` directly instead of going through the guarded transition.
- **DETECTION.** CI runs typecheck + leak suite + view-projection unit tests on every push. The leak suite gains a
  row per new surface: entitlement rows are never cross-readable between actors, multi-candidate photo drafts stay
  inside the adder's projection, revealed items appear to the owner only through the guarded transition, and `/`
  contains no circle identifier. A manual 9-point checklist is run before recording, and again before submission.

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

### v1.1 decisions (amended 2026-10-26)

- **Decision:** the 25% *Use of Meta AI Tooling* category is carried by **product-deep usage plus one documented
  dev-time thread**. Every model call on a user-facing path records model, tokens and latency in `ingest_events`
  and is surfaced in a "model evidence" view; separately, the coding agent is pointed at `https://api.meta.ai`
  (documented by Meta for Claude Code, Codex and OpenCode) and that thread is named in the README and given ~15 s
  of the video.
  **Why:** Stage 1 is pass/fail on whether the project "reasonably use[s] the Meta Model API and/or Meta open-weight
  models to build it", and the scored category asks how creatively Meta's AI was used "to go beyond a basic
  integration". Product evidence is what Impact (30%) and Demo (25%) are judged on, so it stays load-bearing; the
  dev thread is nearly free and is a second, verifiable answer to the same question.
  **Alternatives rejected:** *product-deep only* — forfeits the cheapest available point on a 25% category;
  *also chasing the $10K open-weight bonus (Muse Spark Open / Glimmer via Baseten or Modal)* — partner credits are
  not guaranteed and are reviewed per applicant, and serving an 816B-A42B model off someone else's GPU is not a
  nine-day side quest.
  **Status:** decided. **Revisit if:** partner inference credits land early and the day-7 gate is green, in which
  case the open-weight bonus becomes a real option rather than a hope.

- **Decision:** the WhatsApp assistant is **task-scoped with no free-form chat**. Every inbound message routes to
  one of six bounded tasks (add by voice, add by photo, add by link, status query, claim-or-pool via a 3-button
  reply, write your card message); anything unrecognised receives the same fixed menu. The assistant is labelled as
  AI on the join page and in its first reply.
  **Why:** Meta's WhatsApp Business Solution Terms prohibit general-purpose AI chatbots on the Business Platform
  from 2026-01-15, with accounts registered on or after 2025-10-15 subject immediately. Task-specific assistants
  (customer service, order management, appointments) remain permitted, and a registry assistant that can only do
  six things is squarely that shape. The hackathon separately disqualifies projects that violate platform policies,
  so this is a submission risk, not just a ToS risk.
  **Alternatives rejected:** *free-form Spark chat with a guard prompt* — that is exactly the banned shape, and a
  system prompt is not a compliance control; *no conversational surface at all* — loses the "paste a link into your
  group and talk to it" headline and the Best Agentic Use-Case angle; *the six tasks plus a reveal trigger* — the
  reveal trigger **is** in scope (below) but as an in-app action and a bounded WhatsApp task, not as a conversation.
  **Status:** decided. **Revisit if:** Meta publishes a compliant pattern for bounded generative replies inside a
  task assistant, in which case the fixed menu copy may become model-drafted — never model-decided.

- **Decision:** the UX is a **hybrid split with no WhatsApp Flows in v1**. WhatsApp carries intake (voice, photo,
  link), 3-button choices, list menus and template notifications; the web app carries the ledger, claims and pools,
  attributes, the owner dashboard, capability switches and the card download.
  **Why:** interactive messages are limited to reply buttons (max 3), list messages (≤10 sections / 24 rows), CTA
  buttons, product messages, location requests and Flows, they **cannot be used as notifications**, and they only
  work inside the 24-hour customer-service window. The two screens that carry our score — owner blindness and the
  no-preview card download — cannot be built as WhatsApp message types at all, so a web surface exists regardless.
  **Alternatives rejected:** *Flows for join, attribute onboarding and contribution entry* — a native in-chat form
  is better UX but adds a separate JSON spec plus app-review surface in a nine-day window; *web-first with
  WhatsApp as a pipe* — least WhatsApp-native and weakens the Impact claim that friends install nothing.
  **Status:** decided. **Revisit if:** Flows turn out to need no additional review for our app, post-hackathon.

- **Decision:** per-user AI capability switches are **rows plus one gate, failing closed**. An `entitlements` table
  holds one row per `(user, capability)` with `enabled`; `users.plan` (`free | premium | internal`) supplies the
  default when a row is absent; a single server-side `can(actor, capability)` is called by every model-spending path
  **before** it spends a token. When a capability is off the flow degrades to manual entry with a visible reason —
  never a silent no-op, never a 500 carrying a model error. The capability list is one switch per model-spending
  path: `voice_transcribe`, `photo_extract`, `link_expand`, `card_pun`, `card_art`, `assistant_reply`,
  `deal_search` (the switch exists before the feature does, so reviving the deferred deal spike needs no migration).
  **Why:** you asked for per-feature, per-user on/off that can carry free/premium later. Rows mean a new capability
  or tier is data, not a deploy; one gate means there is a single place to be wrong; failing closed means a missing
  row can never become an unintended model call, which is the same reasoning as `demoMode` in `src/lib/env.ts`.
  **Alternatives rejected:** *plan enum with a hardcoded capability map* — fastest, but every tier change is a
  deploy and you cannot demo "this user turned transcription off" without editing code; *per-circle entitlements* —
  matches who pays but breaks the per-user requirement, since a friend could not refuse transcription of their own
  voice note; *metering and quotas now* — the right long-term shape, but not judgeable in three minutes and it
  competes with the leak suite for the same days.
  **Status:** decided. **Revisit if:** a paid tier needs quotas, at which point usage counters attach to the same
  rows rather than replacing them.

- **Decision:** **consent is the actor's, budget is the circle owner's.** The switch that gates a call is always the
  person who triggered it — a friend who turned transcription off never has their voice note transcribed, even
  inside someone else's circle. Tier limits and quotas key off the circle owner's plan, because the owner is the one
  who would pay.
  **Why:** consent and budget are different axes and conflating them is how a friend's private setting ends up
  governed by someone else. It is also the POPIA-correct reading: the data subject of a voice note is the person who
  spoke it, not the person whose birthday it is.
  **Alternatives rejected:** *owner governs the circle* — simplest and matches who pays, but a friend could not
  refuse transcription of their own voice; *both must allow* — most conservative, but it makes the degraded path
  unexplainable ("why did this not work?") and doubles the states the leak suite must cover.
  **Status:** decided. **Revisit if:** a real paying customer asks for circle-level policy control, which is an
  admin feature, not a v1 one.

- **Decision:** computer vision is **SAM 3.1 masks composited by us**, used for both intake and card art. A
  submitted photo is segmented with a generic noun-phrase prompt; masks are ranked by area, capped at six, and each
  becomes a **draft** the user confirms. `sharp` turns each mask into a transparent PNG at a deterministic path. The
  card reuses the same function to place the product on generated art. Before any cutout is kept, a Spark vision
  pass returns person boxes and every overlapping mask is discarded.
  **Why:** you asked for gift options cut out of photos users submit, and SAM 3.1 is hosted on the Model API
  ($2.50 per 1k images) returning boxes and pixel masks parsed by `@meta-sam/parser`. Muse Image does **not**
  document transparent-background cutout, so compositing is ours either way; doing it once and using it twice is
  what makes it a pipeline rather than a demo trick. Drafts-not-commits reuses the existing intake decision, so
  nothing hallucinated reaches the ledger or the pool maths.
  **Alternatives rejected:** *one best mask only* — cannot show "the gifts in your photo" when the photo holds
  three; *tap-to-select regions* — needs an in-app image-annotation UI we do not have, in the week the leak suite and
  the card renderer also land; *reviving SAM duplicate detection too* — its own kill criterion says ship URL/GTIN
  matching below ~85% precision, and it is a third vision feature in nine days; *Muse Image as the cutout engine* —
  undocumented for transparency, and generated pixels are not the user's product.
  **Status:** decided. **Revisit if:** cutouts are not visually clean on ≥80% of a ten-image fixture set, in which
  case ship text-only intake and describe the feature accurately.

- **Decision:** the **post-event reveal** is in v1.1: any friend in the circle may reveal a secret suggestion, only
  after `circles.event_date` has passed, only when the author left `reveal_ok = true`, and only through a guarded
  transition that writes `revealed_at` and `revealed_by_user_id` to the item and a ledger event. No notification is
  sent — the reveal stays a human act. Reveal covers secret **suggestions** only; claims, pools and contributor
  amounts never enter the owner projection. Early unlock before the event date requires the approval of every active
  friend membership.
  **Why:** the surprise has a natural end, and "look what we almost got you" is a real beat the product currently
  drops on the floor. Keeping the veto with the author is what makes "any friend can reveal" safe: a candid note
  ("she said 43 might be tight") can be marked never-reveal at the moment it is written, by the only person who knows
  whether it was candid. `items_owner_read` already admits `status = 'revealed'`, so the RLS spine needed no change —
  the gate is the date, the veto and the guarded transition.
  **Alternatives rejected:** *adder-only reveal* — most protective and my recommendation, but you chose the communal
  version, and the veto preserves the part of it that matters; *owner-initiated bulk reveal* — one tap for the owner
  to see everything friends said about them, with no author consent; *no time gate* — makes the surprise destructible
  by a single tap before the event; *24-hour hold with author objection* — needs a scheduler and a half-visible state
  to design and test in the last days.
  **Status:** date gate, veto and attribution **decided**; unanimous early unlock **provisional** — cut it at the
  day-7 gate without discussion if anything else is red. **Revisit if:** a real group asks to reveal before the date,
  which is the only evidence that the unanimous-unlock machinery was worth building.

- **Decision:** brand and design come from a **Stitch preview round, then a committed token set**. Four Stitch
  design-system variants are generated against the brief — hot pink plus electric blue, gender-neutral, sparky,
  modern, no cursive or script faces — each with palette, type pairing, button and card treatment, and one rendered
  screen (the friend ledger, being the densest). Three alternative product names sit beside "Gift Circles" so naming
  is decided against the visuals. The chosen variant becomes `DESIGN.md` plus Tailwind tokens; the logo is a
  hand-authored SVG wordmark and mark; type is an OFL-licensed face, self-hosted. Only the light theme ships, but the
  tokens must be dark-mode-ready.
  **Why:** you want to choose the look rather than inherit it, and Stitch is preview-first, so the choice is made
  against rendered screens instead of adjectives. Hand-authored SVG and OFL type keep the public repo clean under the
  hackathon rule against using assets you lack rights to, and a vector mark stays crisp on the A6 card at 300 DPI
  where a generated raster would not.
  **Alternatives rejected:** *Muse Image generates the brand* — a stronger Best Creative Build story, but a raster
  logo, a 150 RPM cap that makes iteration slow, and a rights question on generated brand assets in a public repo
  (Muse Image stays in scope for card backgrounds and item art, where it is a feature rather than an identity);
  *shipping dark mode too* — nearly free once tokens exist, but it doubles visual QA on seven screens in the week
  before recording.
  **Status:** **provisional** until you pick a variant — the process is decided, the palette and name are not.
  **Revisit if:** the Stitch round produces nothing that beats a hand-authored token set, in which case the tokens
  ship without it and the video does not linger on the UI.

- **Decision:** the public landing page is **static, at `/`, with the app screens under `/app` and the circle join
  link unchanged at `/c/<slug>`**. It carries the two-line problem, the three-step story, a screenshot strip from the
  seeded fictional cast, the demo video embed and a CTA into the app. `Cache-Control: public, max-age=300`. It
  renders no circle data and no path from it reaches a card route.
  **Why:** the Community Vote gallery ($10K) sends strangers to a URL, and a judge or voter who lands on a login
  screen bounces. Keeping `/c/<slug>` exactly where it is matters more than tidiness: that link is pasted into a
  WhatsApp group, and moving it would break every circle already shared.
  **Alternatives rejected:** *a public gallery of demo circles* — every public render of a ledger is a new leak
  surface in the week before recording; *headline-and-CTA only* — wastes the page the vote actually points at;
  *moving the app to `/` and the marketing page elsewhere* — inverts what a voter expects and risks the share link.
  **Status:** decided. **Revisit if:** the leak matrix cannot cover the page cheaply, in which case it ships without
  the screenshot strip.

### v1.2 decisions (amended 2026-10-26, third round — identity, billing path, dependencies)

Asked as *"post-hackathon thoughts, but the architectural decisions have to be made early to avoid refactoring"*.
Full rationale, every rejected alternative and all sources live in
`docs/plans/user-management-and-billing-path.md`; these are the decisions themselves.

1. **Identity is hand-rolled. No auth framework.** The credential is *"Meta already verified this BSUID"* or *"this
   person proved possession of an allow-listed number"* — neither of which Better Auth, Auth.js, Supabase Auth or Clerk
   models. Each candidate either ignores WhatsApp as a delivery channel or owns identity tables queried through its own
   connection, which would put an unscoped identity path alongside a privacy model that assumes exactly one scoped path
   (`withActor`). The web session is an HMAC-signed httpOnly cookie over `{userId, circleId, role}`.
   **Status:** decided, built. **Revisit if:** browser OAuth, multi-device revocation or SSO becomes a requirement.
2. **`SameSite=Lax` is a product requirement.** The circle link arrives as a top-level GET navigation out of WhatsApp's
   in-app browser; `Strict` drops the cookie there, so every shared link would render logged-out on the product's only
   distribution channel. Asserted by a test, because the failure looks like a database problem from the inside.
   **Status:** decided.
3. **Friends join through the allowlist hash; OTP is an upgrade, not a dependency.** The authentication template is
   always charged, takes ≤24 h and can be rejected. `POST /c/<slug>` matches a keyed hash of the submitted number
   against that circle's `allowlist_entries` and writes nothing before the match. **Status:** decided for the
   hackathon, provisional after it.
4. **The owner's web session is an open gap, recorded rather than discovered on day 9.** The owner is not on their own
   allowlist and the seeded cast deliberately contains no phone numbers, so the phone gate cannot admit them. Their
   natural credential is the BSUID from the task bot (F13). Interim for the recording: the operator mints the cookie
   with a local script calling `issueSession(...)` — a build-time tool, **not** a deployed endpoint.
   **Status:** open. Decide bot-path vs minted-cookie with the cast on day 7.
5. **No payment integration before submission.** **Stripe does not onboard South African entities** — stripe.com/global
   lists ZA only under an "Extended network" badge pointing at Paystack. Post-submission the ZA rail is **PayFast**
   (owner decision 2026-10-26): ZAR settlement into a ZA bank, no setup or monthly fee, published Oct 2026 rates of
   3.2% + R2.00 on cards and 2.0% (min R2.00) on Instant EFT, and a first-party Subscriptions API. Two constraints
   shape the design: **recurring is credit-card only** ("For Recurring Billing only the credit card option can be used"
   — PayFast developer docs), so a subscription flow must collect a card even though the free tier does not; and
   **PayFast is a gateway, not a merchant of record**, so the cross-border tax position is unchanged. A **merchant of
   record** (Paddle first choice; Lemon Squeezy the backup, rejected for now because it is mid-migration to Stripe
   Managed Payments; Polar pays out *to your Stripe account* so it is effectively unavailable to a ZA resident) is
   therefore deferred until non-ZA revenue is material, not dropped. The reason to buy rather than build is tax, not
   fees: ZA's VAT threshold is R2.3m so domestic VAT is not the problem, but EU digital B2C has **no** threshold for
   non-EU sellers, the UK requires registration regardless of turnover for overseas sellers, and US states have
   post-*Wayfair* economic nexus. An MoR absorbs all three. The likely end state is both: PayFast for ZA, an MoR for
   everywhere else, writing the same `subscriptions` rows.
   **Status:** timing decided (nothing before 4 Nov), ZA provider decided (PayFast, uncontracted), MoR open.
   **Revisit if:** Stripe opens ZA; the first non-ZA subscriber appears, which triggers the MoR immediately; gift-pool
   payouts force a US entity anyway; or PayFast recurring stops being card-only.
6. **The billing schema shape is fixed now so it stays additive:** `plans`, `subscriptions`, `billing_customer`,
   `webhook_events` (idempotency). The provider is the source of truth and `users.plan` is a **derived cache** — safe
   only if the webhook handler is its sole writer and updates `plan` and the `entitlements` rows **in one
   transaction**. Written separately, a request can land between the two. **Status:** decided as a shape, not
   scheduled.
7. **Adopt `Secreto31126/whatsapp-api-js` (MIT).** Worth it specifically for webhook `x-hub-signature-256`
   verification and media download by media-id — the two places where a subtle bug is a security hole rather than a
   cosmetic one. **Never** adopt an unofficial WhatsApp client (`whatsapp-web.js`, Baileys, `wa-automate-nodejs`,
   wppconnect, Evolution API): Business Solution Terms violation, and the hackathon disqualifies platform-policy
   violations. Star count is not evidence of permission. **Status:** decided.
8. **No flag or entitlement service.** Flags are deployment-scoped booleans; entitlements are per-user private rows
   under RLS. A flag service would evaluate them outside RLS — shipping user entitlement state to a sidecar for seven
   booleans. Unleash is AGPL-3.0, Flipt fair-core, PostHog mixed-licence, Flagsmith heavy. **Status:** decided.
9. **Card rendering is `satori` + `@resvg/resvg-js` (or `@vercel/og`), not Puppeteer.** MPL-2.0 is file-level copyleft,
   so unmodified npm packages in a public repo carry no obligation, and no Chromium binary goes on the Oracle VM.
   **Status:** decided.
10. **Meta Model API needs no bespoke SDK** — Meta documents it as drop-in compatible with the OpenAI SDK at
    `https://api.meta.ai/v1` with bearer auth. **Provisional:** that claim comes from reading the quickstart on
    2026-10-26, not from a call we have made, and it is re-verified by the day-1 exit gate (`GET /v1/models`) at no
    extra cost.

**New hard failures added by this round** (all pinned by tests in `tests/routes/circle-link.test.ts`, each proven red
first): a session accepted for a circle it was not minted for; the owner's HTML containing a claim, pool, contributor
name or message; any `/c/<slug>` response being cacheable; the allowlist gate creating a user before it authorised.

**Architectural fact discovered while proving the fourth one:** the friend projection is **not** itself owner-blind.
The owner is a member, so `friendCircleView` returns rows for them — routing an owner session down the friend branch
rendered the secret suggestion and the pool. **The route is what keeps the owner out of it.** That is now asserted
rather than assumed, and it is the reason the two branches are separate code paths and not a ternary over the role.

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

Added by the v1.1 amendment:

- **Capability gate:** the gate *is* the feature flag. A capability that misbehaves in the demo is turned off in the
  switch screen and the flow degrades to manual — no redeploy, no migration, no code path removed.
- **Entitlements migration:** expand-only (new `entitlements` table, nullable-then-defaulted `users.plan`, new
  nullable `items.reveal_ok | revealed_at | revealed_by_user_id`), so the previous image tag still runs against the
  newer schema. Recovery is the previous tag; nothing is dropped during the hackathon.
- **Design system:** pure additive CSS and tokens, no migration. Rollback is `git revert` of the token commit; the
  screens keep working unstyled because correctness never depended on the theme.
- **Vision path:** artifacts are written under `MEDIA_DIR/cutouts/…` and referenced from the draft JSON, so removing
  the feature leaves orphan files, not orphan rows. Turning `photo_extract` off removes it from the product
  instantly.
- **Reveal:** a reveal is a guarded one-way transition, so the rollback for a mistaken reveal is a ledger-visible
  admin action, not a silent un-write. Early unlock rows are additive and can be deleted without touching items.
- **Landing page:** static route; rollback is deleting it, and `/c/<slug>` never depended on it.

### Deploy order / cutover

Day 1: DNS record → Caddy (TLS must validate before anything else) → Postgres container → app container.
Day 2: webhook endpoint registered with Meta **only after** the URL returns a valid `hub.challenge` verify over
HTTPS; then inbound; then send.
Day 3: vertical slice recorded as a screen capture, which doubles as the day-9 demo insurance file.
Every later change: staging = the same VM on a second compose project and a second path prefix, verified before
promoting. There is no dual-write window; the single Postgres is the source of truth and nothing else holds state.
**Freeze deploys after Nov 3.** Submission artifacts (video, repo, live URL) are cut from the Nov 3 build.

Added by the v1.1 amendment — the order matters, because a gate retrofitted after five model paths exist is how one
path gets missed:

1. **Entitlements table + `can()` gate first**, before any new model-spending path is written, and retrofitted onto
   the three existing ones (voice, link, screenshot) in the same commit. Verify gate: a test that a missing
   entitlement row fails closed, and a test that an off capability produces the degraded reply rather than a call.
2. **Design tokens second** (`DESIGN.md` → Tailwind theme), so every screen built afterwards is already branded and
   the Stitch round does not block a feature.
3. **Vision third**, written already gated on `photo_extract`.
4. **Reveal and landing page fourth** — both are additive surfaces with no dependency on the above.
5. The route move (`/` → landing, app under `/app`) ships in one commit **with** the landing page, and
   `/c/<slug>` is asserted unchanged by a test in the same commit, because that URL is already pasted into a
   WhatsApp group.

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

Added by the v1.1 amendment:

- **Cutout artifacts are idempotent by deterministic path:** `MEDIA_DIR/cutouts/<wa_message_id>/<index>.png`. A
  webhook redelivery re-derives the same paths and reuses bytes already on disk instead of re-calling SAM, so a retry
  costs nothing and cannot produce a second set of candidates.
- **Multi-candidate drafts live in `ingest_events.draft` as an array** with per-candidate state
  (`pending | confirmed | dismissed`) and the created `item_id` once confirmed. One ingest event, one photo, N
  candidates — the `item_id` column stays null for multi-candidate events, because a single FK cannot point at six
  items and inventing a seventh table for ephemeral drafts is not worth it. The ledger holds the real state from the
  moment an item exists.
- **Entitlement writes are upserts on `(user_id, capability)`**, so a double tap on a switch cannot create two
  conflicting rows.
- **Reveal is a guarded transition:** `UPDATE … SET status='revealed' WHERE id=$1 AND status='active' AND
  visibility='friend_only' AND reveal_ok`. Zero rows affected means someone already revealed it, or the veto was set,
  or the date gate is closed — all three render the same 404, so the response cannot be used to probe.
- **Early-unlock approvals are unique per `(request, user)`** and the reveal gate counts distinct approvals against
  active friend memberships at read time, so a member who leaves the circle cannot keep the unlock permanently
  blocked.

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
1. Friend taps the link on their phone and enters the name they want on the card plus their number.
2. A keyed hash of the number matches an allowlist entry for that circle whose status is **not** `removed` → the user
   and an active `friend` membership are created, the entry flips `pending → accepted`, and a signed session cookie is
   issued. **Nothing is written before the match.** An owner-added invite starts `pending`, so requiring `accepted`
   first would mean nobody could ever join; `removed` is the only refusal. OTP becomes a second door if and when the
   authentication template is approved — it is an upgrade, not a dependency.
3. Friend sees `friend` projection: all `owner_visible` items **plus** friends' secret suggestions, claims, pools,
   contributor amounts, and the owner's shareable attributes on the item sheet.
4. A session minted for a different circle is not a session for this one, and a caller with no session gets the gate —
   never circle content. Both are asserted in `tests/routes/circle-link.test.ts`.

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
8. **v1.1:** the product image on the card is the cutout from F11 (or from the retailer's `og:image`), composited
   over the `muse-image` background by the same function that produces intake cutouts.

### F11 · Photo → cutout candidates (v1.1)
1. Owner or friend sends a photo to the business number — a store shelf, a catalogue page, a screenshot, or gifts
   already bought. Webhook receives `image` (≤5 MB), dedupes on message id, downloads the bytes inside the
   5-minute URL window, stores them under `MEDIA_DIR`.
2. **Gate:** `can(actor, 'photo_extract')`. Off → the fixed menu plus "photo extraction is off in your settings" and
   a link to the switch screen. No model call is made.
3. Spark vision pass over the source photo with a flat `json_schema` returning person boxes. Any mask overlapping a
   person is discarded before it is stored — this is the person-pixel hard failure guard, and the fixture set
   includes a photo with a person in it so the guard is proven to fire.
4. `POST /v1/responses` with model `sam-3.1`, a generic noun-phrase prompt and `input_image`; parse boxes and masks
   with `@meta-sam/parser`.
5. Rank by area, cap at six, drop masks below a minimum area. Composite each to a transparent PNG with `sharp` at
   `MEDIA_DIR/cutouts/<wa_message_id>/<index>.png`.
6. Write the candidate array into `ingest_events.draft` with per-candidate state. Each candidate becomes a **draft**
   card in the adder's screen with the cutout as its image, and a title the model guessed.
7. The adder confirms, edits or dismisses each draft. Confirmed drafts create `items` rows through the same
   transition F2 uses; dismissed ones never touch the ledger. Nothing auto-commits.
8. Projection: a friend's photo drafts are `friend_only` until confirmed, exactly like F7's secret suggestions.

### F12 · Per-user capability switches (v1.1)
1. Any signed-in user opens Settings → AI capabilities. One row per capability, each with a plain-language
   description of what it does and what happens when it is off.
2. Toggling writes an `entitlements` upsert. A capability with no row inherits the plan default; the gate fails
   closed on error.
3. When a capability is off, every path that would have used it degrades visibly: voice intake becomes "type it
   instead", photo intake becomes the fixed menu, card art becomes the plain card, card puns become a hand-written
   line. The reason is shown, never inferred.
4. These switches are the actor's own rows and are never rendered into another actor's projection — a friend cannot
   see the owner's settings and the owner cannot see anyone's.

### F13 · The WhatsApp task-bot surface (v1.1)
Six bounded tasks, and nothing else:
1. **Add by voice** → F2. 2. **Add by photo** → F11. 3. **Add by link** → F3.
4. **Status query** — owner hears "you have 3 wants, 1 unconfirmed"; friend hears "these are still unclaimed".
   Both answers come from the caller's own projection, so the owner's answer cannot contain a claim.
5. **Claim or join a pool** — a 3-button reply (`Claim it` / `Join a pool` / `Not now`) inside the 24-hour window.
6. **Write your card message** — the contributor replies with one line; it is stored as their `card_entry` with the
   same ≤200-char and no-URL rules as the web composer, and echoed back for confirmation.
7. Anything unrecognised gets the same fixed menu every time. The assistant is labelled as AI in its first reply and
   on the join page. It never generates a reply that decides what happens next — it generates copy at most, and only
   for tasks 4 and 6, both gated on `assistant_reply`.

### F14 · Post-event reveal (v1.1)
1. After `circles.event_date` has passed, a friend's item sheet shows "Reveal to Nadia" on secret suggestions where
   the author left `reveal_ok = true`. Before the date the button does not render and the route 404s.
2. Tapping it runs the guarded transition: `status → revealed`, `revealed_at`, `revealed_by_user_id`, plus a ledger
   event. Zero rows affected renders the same 404 as "not yours".
3. **No notification is sent.** The reveal is a human act; the owner sees it the next time they open the app.
4. The owner projection now includes the item, attributed to whoever revealed it. Claims, pools and contributor
   amounts stay out permanently.
5. An author who set `reveal_ok = false` when adding the suggestion is never revealed, by anyone, at any time.
6. Early unlock (provisional, cut at the day-7 gate): any friend may request it; every active friend membership must
   approve; approvals are counted at read time.

### F15 · Public landing page (v1.1)
1. `/` is static: the two-line problem, the three-step story, a screenshot strip from the seeded fictional cast, the
   demo video embed, and a CTA into the app. `Cache-Control: public, max-age=300`.
2. It renders no circle data and no dynamic query, and there is no path from it to a card route.
3. The app screens move under `/app`. **`/c/<slug>` does not move** — that URL is already pasted into a WhatsApp
   group, and a test asserts it still resolves.

## Out of scope for v1

Holding money, escrow, Stripe Connect, KYC. Native iOS/Android. Facebook/Messenger/Instagram surfaces. Facebook
Login. Marketplace scraping in any form. The coordination/nudge **agent** (pool maths and state are in; LLM
negotiation is not). SAM 3.1 **duplicate detection** (cutout extraction is in scope as of v1.1; similarity matching
between two screenshots is not). `web_search` deal-finding. Public discovery of
strangers by phone number, and the contact-sync mitigation the competitor doc suggested — both deferred, because
public lookup is a scraping surface we don't need for a gated-circle demo. Multi-currency beyond ZAR. Real user
accounts, password login, email. Search, filters, analytics dashboards. Mobile-app install flows. Automated
template re-rolls after rejection.

Still out after the v1.1 amendment: payments, metered billing, quota counters and any pricing page (the entitlement
rows are the foundation, not the shop); WhatsApp **Flows**; native apps; a shipped dark theme (tokens must be
dark-ready, only light ships); tap-to-select segmentation regions; a public gallery of demo circles; i18n beyond
English; free-form or generative conversation in WhatsApp under any circumstances; and revealing claims, pools or
contributor amounts to the owner, which no flag or date gate can turn on.

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

Added by the v1.1 amendment:

- **[TODO: needs your pick] Brand variant and product name.** Four Stitch variants and three alternative names are
  generated against the brief (hot pink + electric blue, gender-neutral, sparky, modern, no cursive); the choice is
  yours and the decision stays **provisional** until you make it. Blocking for step 17 only.
- **[TODO: needs your restart, not your OAuth] Stitch MCP access.** The server config is registered locally
  (`npx -y @_davideast/stitch-mcp proxy`) and `STITCH_API_KEY` is persisted in `HKCU\Environment`. The server still
  exits 1 because Qoder Desktop was launched **before** that variable existed, so the spawned process never inherits
  it — restarting the app is the fix, and no browser OAuth step is involved. The `init` wizard's client list does not
  include Qoder and does not need to: it only chooses which config file to write, and ours is already written. If it
  is not working by day 5, the token set ships hand-authored and the video simply does not linger on the UI.
- **[TODO: verify on the fixture set] Does one generic SAM noun phrase segment gifts well enough?** "gift" versus
  "product" versus per-category phrasing is an empirical question; the ten-image fixture set answers it, and the
  ≥80%-clean kill criterion decides whether the feature ships at all.
- **[TODO: verify] Is the person-box pre-check reliable enough to be the guard?** If Spark's person boxes miss a face
  in the fixture set, the fallback is to refuse cutouts from any photo the classifier marks as containing a person at
  all — coarser, but it fails closed.
- **[TODO: decide by day 8] Demo video embed on the landing page:** unlisted YouTube (needs network during judging,
  which Nov 5–8 does not guarantee) or a self-hosted MP4 on the VM (uses bandwidth we do not have much of).
- **Unanimous early-unlock** stays provisional until the day-7 gate; it is the first thing cut.

Added by the v1.2 amendment:

- **[TODO: decide by day 7] How does the *owner* get a web session?** The allowlist gate admits friends only, and the
  seeded cast deliberately has no phone numbers. Either the WhatsApp task bot mints it from the BSUID (F13, the proper
  answer) or the operator mints it locally for the recording. Decide with the cast, not on day 9.
- **[TODO: verify on day 1] Is the Model API really OpenAI-SDK compatible?** Decision 10 rests on Meta's quickstart
  wording, read 2026-10-26 rather than exercised. The day-1 `GET /v1/models` exit gate settles it for free; if the
  shape does not survive the OpenAI SDK — particularly for `web_search` grounding and flat `json_schema` — the ingest
  layer calls it with `fetch` + zod instead, which was always the fallback.
- **[TODO: revisit when F14 is built] Is a 14-day session TTL right when the event may be months away?** Re-clicking
  the WhatsApp link re-mints, so probably yes — but the post-event reveal happens *after* the event, and a stale cookie
  there means the reveal needs its own re-entry path.
- **Does `users.phone_e164` need to stay plaintext?** It is the fallback identity and is unique-indexed, so it is
  queryable as-is, and RLS keeps it out of every projection except the roster read. Hashing it would turn cross-circle
  identity resolution into a lookup problem. Current answer: keep it. It is the first thing to revisit if a real
  deployment ever sits behind this public repo.

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

### v1.1 additions (amended 2026-10-26)

**Schedule honesty:** these steps add roughly three and a half days of work to a nine-day plan that was already
full. They are listed in dependency order, not wishful order, and the cut list below is decided *now* rather than at
2 a.m. on day 8.

16. **Entitlements + the `can()` gate (day 3, before the voice path is written).** `entitlements` table,
    `AiCapability` enum, `users.plan`, `src/server/entitlements.ts` with `can()` / `assertCan()`, retrofitted onto the
    three existing model paths in the same commit. Non-negotiable: it is the guard for a hard failure, and a gate
    retrofitted after five paths exist is how one path gets missed.
17. **Brand round (day 4, half a day).** Register Stitch MCP → generate four design-system variants plus three name
    options → you pick → write `DESIGN.md` → Tailwind token set. If Stitch is not working by day 5, the tokens ship
    hand-authored from the brief.
18. **Screens built styled (day 4–8, incremental).** Join/gate, owner ledger, friend ledger, item detail, draft
    confirm, card composer, settings/switches, plus the landing page. Each screen is styled as it is built; there is
    no "styling pass" at the end, because that pass never happens.
19. **Vision cutout path (day 6–7, F11).** Person-box pre-check, `sam-3.1` call, `@meta-sam/parser`, `sharp`
    compositing to deterministic paths, candidate array in `ingest_events.draft`, confirm/dismiss UI. Then reuse the
    same function for the card art (F10 step 8). Gated on `photo_extract` from the first commit.
20. **WhatsApp task-bot surface (day 6–8, F13).** The **fixed menu ships first** — it is the compliance floor and it
    is what every unrecognised message hits. Then the six tasks in the order they already exist server-side: voice,
    photo, link, status query, claim/pool buttons, card message capture.
21. **Post-event reveal (day 8, F14).** Date gate + `reveal_ok` veto + guarded transition + attribution. Unanimous
    early unlock is built only if everything above is green.
22. **Landing page + route move (day 8, F15).** Static `/`, app under `/app`, `/c/<slug>` asserted unchanged by a test
    in the same commit.

**Cut order when the schedule collapses** (first cut first): unanimous early unlock → landing-page screenshot strip
(video embed only) → card-art cutout (text-only card, still honest) → photo intake beyond one best mask → the reveal
entirely → the landing page. **Never cut:** the capability gate, the leak suite, the voice path, the fixed-menu
compliance floor, or the `/c/<slug>` URL.

## Guardrails

- Only two real failure states exist: a privacy leak, and no live Meta model in the demo. Everything else is
  negotiable; those two are cut-list-inverted, meaning features go **before** the leak suite or the model path.
- No feature ships without declaring which projection renders its data. New column ⇒ new `owner_visible |
  friend_only` decision, in writing, in the migration comment.
- Every live API call gets a deterministic fallback path before it appears in the demo script.
- No real names, phone numbers, or gift conversations in any committed file, fixture, screenshot or video.
- The demo is recorded from the deployed URL, never from localhost, or it doesn't count.

Added by the v1.1 amendment:

- **No model call without passing `can(actor, capability)` first.** There is one gate and every spending path goes
  through it; a capability that runs after being switched off ranks with a privacy leak, not with a bug.
- **No person pixels in a cutout, ever.** The person-box pre-check runs before the mask is stored, and the fixture set
  includes a photo with a person in it so the guard is proven to fire rather than assumed to.
- **The assistant never decides what happens next.** It may generate copy for a status answer or a card message; it
  may not choose a task, change state, or reply to anything outside the six. Fixed menu or nothing.
- **Every new screen declares two things in writing:** which projection renders its data, and its `Cache-Control`.
  Public, friend-only and owner-only surfaces do not share a cache key or a route prefix.
- **`/c/<slug>` never moves.** It is already pasted into a WhatsApp group; a test asserts it resolves.
- **Degraded means explained.** When a capability is off, the user is told which one and why the flow changed. A
  silent no-op is a support ticket we cannot answer.
