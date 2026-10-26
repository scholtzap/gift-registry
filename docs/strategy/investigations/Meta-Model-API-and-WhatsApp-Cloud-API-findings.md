---
type: investigation
status: current
priority: critical
title: Meta Model API and WhatsApp Cloud API findings (verified against primary docs)
captured: 2026-10-26
---

# Meta Model API and WhatsApp Cloud API — verified findings

**Why this matters.** The architecture rests on these facts, not on assumptions. Each was checked
against Meta's primary documentation. Anything the docs did **not** confirm is marked
**UNVERIFIED** and must stay a question, not a design input. Re-verify before changing an
architecture decision that cites this file, and record the verification date in the change.

Related: [`../hackathon-rules-and-rubric.md`](../hackathon-rules-and-rubric.md) (deadlines, rubric,
the "no data you lack rights to" rule), [`../Gift-Wishlist-App-Competitor-Analysis.md`](../Gift-Wishlist-App-Competitor-Analysis.md)
(the gated-link + asymmetric-state decisions these constraints are applied to).

---

## 1. Meta Model API

Base `https://api.meta.ai/v1`, Bearer key prefixed `LLM_`, env var `MODEL_API_KEY`.

### 1.1 Model IDs (exact strings; no wildcards)

| ID | Notes |
|---|---|
| `muse-wonder-1.0` | Preview; most capable. |
| `muse-spark-1.3`, `muse-spark-1.2`, `muse-spark-1.1` | Spark series. |
| `muse-spark-1.3-contributor`, `muse-spark-1.2-contributor` | Contributor variants. |
| `muse-image-1.0` | Image generation and editing. |
| `muse-voice-transcribe-1.0` | Speech-to-text. |
| `sam-3.1` | Segment Anything. |

`GET /v1/models` lists the models enabled on your key.

**`Muse Glimmer` (30B) and `Muse Spark Open` (816B-A42B) are NOT on the Model API — self-host
only.** Therefore `meta-models/muse-spark-open-1026` is a Baseten/partner model string, **not** a
Model API ID. The `-1026` suffix could not be confirmed on Baseten's own page — **UNVERIFIED**.

### 1.2 API surfaces

Three surfaces, all with streaming SSE:

- Responses — `/v1/responses`
- OpenAI-compatible — `/v1/chat/completions`
- Anthropic Messages — `/v1/messages`

Tool calling is fully supported on the OpenAI-compatible surfaces.

**Structured output:** `response_format: json_schema` (Chat Completions) or `text.format`
(Responses); decoding is constrained to the schema. **But recursive JSON schemas return HTTP 400 —
flatten item/split schemas.** This directly shapes the intake pipeline: the "voice note / screenshot
→ item" extraction schema must be flat, no nesting.

**Modality + context:** Wonder and Spark accept text, image, video, audio and PDF;
**1,048,576-token context**, **131,072 max output tokens**. Images go in via `image_url`, which
accepts a public URL, a base64 data URL, or a `file_id`.

> **Audio caveat (verbatim from the docs):** "Audio understanding in Muse Spark 1.3 is not fully
> supported… response quality may be degraded. **For audio, use Muse Spark 1.2.**"
> → Voice-note intake must call `muse-spark-1.2`, not 1.3.

### 1.3 SAM 3.1 — hosted, no self-hosting needed

`POST /v1/responses` with model `sam-3.1`, a **text noun-phrase prompt** plus `input_image` or
`input_video`. Returns boxes and pixel masks as a special-token text grammar
(`<|box;...|><|mask;...|>`) parsed by `@meta-sam/parser`.

### 1.4 Muse Image

Does generation **and** editing: `/v1/images/generations`, `/v1/images/edits` (multipart, or JSON
with an `images` array of `file_id`s), plus multi-turn editing through Responses.
**Transparent-background cutout is NOT documented** — use SAM masks for extraction instead.

### 1.5 Muse Voice Transcribe

`POST /v1/asr/transcribe`, or realtime at `wss://api.meta.ai/v1/asr/realtime`.
Diarization, 25 languages, keyword biasing, **turn-level (not word-level) timestamps**, **no TTS**.

> **Constraint that drives an ingest step:** the file endpoint accepts **only RIFF/WAVE mono 16-bit
> PCM at 16 or 24 kHz**. WhatsApp voice notes arrive as `audio/ogg; codecs=opus`, so they **must be
> ffmpeg-converted before transcription**. Realtime needs raw paced PCM; sessions cap at 60 minutes.

### 1.6 Web search grounding

Add `{"type":"web_search"}` to a Responses call → cited text with URLs.
**This is the compliant replacement for Marketplace scraping.** It returns cited *text*, **not**
structured product records — prices must be extracted from the snippets by the model.

### 1.7 Pricing (per 1M tokens unless stated)

| Model / feature | Input | Output | Cached input |
|---|---|---|---|
| Spark | $1.25 | $4.25 | $0.15 |
| Spark contributor | $0.10 | $0.20 | $0.002 |
| Wonder | $4 | $20 | $0.20 |

Muse Image **$0.01/image**. Voice **$0.18/hour**. SAM **$2.50 per 1k images**, **$0.20 per 1k video
frames** with a **50-frame minimum**. Web search **$2.50 per 1k queries**.

### 1.8 Rate limits — per **team**, not per key

| Scope | Limit |
|---|---|
| Wonder / Spark | 3,000 RPM / 4M TPM |
| Contributor variants | 150 RPM |
| `sam-3.1` | 3,000 RPM |
| `muse-image-1.0` | **150 RPM** |
| Voice | 256 concurrent / 16,000 streams per hour |

`x-ratelimit-*` headers are present on all endpoints **except transcription**.

### 1.9 Coding agents

**Claude Code is explicitly documented**: `ANTHROPIC_BASE_URL=https://api.meta.ai`,
`ANTHROPIC_AUTH_TOKEN=$MODEL_API_KEY`, plus `ANTHROPIC_MODEL` and `CLAUDE_CODE_SUBAGENT_MODEL`.
Codex (Responses) and OpenCode are also documented.
**Cursor is NOT mentioned anywhere in Meta's docs — UNVERIFIED**, even though the hackathon brief
assumes Cursor as the primary IDE with Muse Spark as an OpenAI-compatible custom provider. Expect
to configure it by hand and test it on day 1; do not assume it works.

### 1.10 Open questions and risks (do not upgrade these into facts)

- **CONFIRMED (hackathon participant guide + acceptance email blast, primary sources):** "In order
  to use your credits & make an API call, a credit card must be applied to your account." Treat a
  attached card as a **day-1 prerequisite**, not a risk. The guide also documents a Billing-page
  "Spend Limit" notification to cap spend at the granted $150.
- **UNVERIFIED:** the exact $150 credit grant mechanism (batched distribution after form
  submission) and whether any call works before distribution lands. Signup and billing sit behind
  SSO, so the terms could not be read.
- Geographic availability varies per Meta's Geographic Use Policy; `muse-wonder-1.0` is unavailable
  in South Korea.
- **SINGLE POINT OF FAILURE:** **whether `web_search` grounding is available to a South African
  account is UNCONFIRMED.** The entire deal-discovery feature depends on it. Verify on day 1, and
  keep the deterministic ZA fixture path as the fallback.
- Sources: https://dev.meta.ai/docs/models, https://dev.meta.ai/docs/quickstart,
  https://dev.meta.ai/docs/pricing-rate-limits, https://dev.meta.ai/docs/structured-output,
  https://dev.meta.ai/docs/sam/overview, https://dev.meta.ai/docs/speech-to-text,
  https://dev.meta.ai/docs/image-generation, https://dev.meta.ai/docs/api-reference/images/edit-image,
  https://dev.meta.ai/docs/coding-agents, https://dev.meta.ai/docs/search-grounding,
  https://dev.meta.ai/events/global-hackathon,
  https://dev.meta.ai/help/accounts-and-login/supported-countries,
  https://www.baseten.co/library/muse-spark-open/, https://research.meta.ai/blog/muse-spark-open

---

## 2. WhatsApp Cloud API

### 2.1 Inbound media

Voice notes, images, videos and documents **are delivered on the `messages` webhook**. The audio
payload carries `id`, `mime_type`, `sha256`, `url` and a `voice` flag; the documented voice-note
type is `audio/ogg; codecs=opus`.

Download the bytes via `GET /{media-id}` with the bearer token, which returns a URL valid for only
**5 minutes**. Size limits: audio and video **16 MB**, images **5 MB**, documents **100 MB**.

> **Webhook media IDs expire in 7 days.** Upload-originated IDs expire in **30 days** — do not
> confuse the two. **Meta does not parse media for you**, so ingest must fetch and interpret the
> bytes on arrival, not lazily.

### 2.2 Test / sandbox setup

Inbound works in the test setup **without a paid or verified business**. A test WhatsApp account,
test messaging account and test business phone number are created automatically, and they "don't
require a payment method on file in order to send template messages".

### 2.3 Messaging windows, templates and cost

- **24-hour customer service window:** free-form text inside the window; approved templates outside.
- Utility messages sent **in response to a user** have been **free since 2025-07-01**.
- Template review is "up to 24 hours" (automated plus manual) and **can reject**.
  **UNVERIFIED:** there is no evidence of pre-approved sandbox templates that skip review —
  **assume you must wait 24h**. Submit template text on day 1.
- **OTP rule (explicit in the template-categorization doc): "Only authentication templates can be
  used to send a one-time passcode."** Authentication messages are **always charged, even inside a
  service window**. Authentication templates are global, with fixed preset text and a variant
  choice of one-tap autofill / copy-code / no-button, and `code_expiration_minutes` min 1, max 90.
  **South Africa is on the authentication-international rate card effective 2025-02-01**, so +27
  OTPs cost per message.
- **"Login with WhatsApp"** / phone-number lookup as an identity provider: **could not be confirmed
  in official docs — assume unavailable for +27.**
- **Default messaging limit: 250 unique recipients per 24h outside a window.** Tier ladder
  250 → 2k → 10k → 100k → unlimited; business verification **or** 2,000 sent messages lifts you to
  2k.

### 2.4 Groups — exists, but do not build on it

A Groups API now exists (create groups, send text/media/templates, receive group messages,
participant webhooks). **But:** it requires an **Official Business Account**, excludes WhatsApp
Business app numbers, the **business must create the group**, the cap is **8 participants** and
10,000 groups per number, and authentication / interactive / view-once messages are unsupported.

> **You still cannot post into a user's existing friend group.** So the architecture we chose —
> the **owner pastes one link into their own WhatsApp group** — is correct and needs **no** Groups
> API. Do not build on the Groups API.

### 2.5 ToS obligations that land in the UI

- **Opt-in is mandatory for all template messages.** The app must clearly state, **on the gated
  link page**, that the person is opting in to communication from the business, and must state the
  business name. This is a required element of the join screen, not optional copy.
- Utility content must be "specific to or requested by the user". **Pooling nudges risk automatic
  reclassification to MARKETING** (category updated with 1 day's notice, or immediately if
  previously warned) — and MARKETING is priced and rate-limited hardest.
- Peer-to-peer relay is not explicitly prohibited, but it is **evaluated per message**.

### 2.6 Business-Scoped User IDs (BSUID)

Rolling out **"gradually in 2026"**. **If a user enables usernames, their phone number is OMITTED
from webhooks** unless you messaged them / received a message in the last 30 days, or they are in
your contact book. The docs say you "must support BSUID to avoid losing the ability to process
their messages".

> **Schema consequence:** **key users on BSUID, with the phone number as fallback only.** A
> phone-keyed user table silently loses messages.

### 2.7 Demo risk

- **UNVERIFIED:** whether test-number recipients must be pre-added to a console **"Send To" allowed
  list**. **Confirm in the console before demo day — this is the most likely demo blocker.**

- Sources (base `https://developers.facebook.com/documentation/business-messaging/whatsapp/`):
  `webhooks/reference/messages/audio`, `business-phone-numbers/media`, `webhooks/overview`,
  `templates/template-categorization`, `templates/template-review`,
  `templates/authentication-templates/authentication-templates`, `pricing`,
  `pricing/authentication-international-rates`, `groups`, `about-the-platform`, `messaging-limits`,
  `getting-opt-in`, `business-scoped-user-ids/`

---

## 3. Marketplace / deal-finding

### 3.1 There is no Marketplace search API

**No Graph API endpoint searches Marketplace listings.** The only Marketplace developer products are:

- **Marketplace Partner Item API** — approved partners manage **their own** listings, in certain EU
  countries. It returns **nothing** about other sellers.
- **Meta Content Library API** — does search `facebook/marketplace-listings/preview`, but is
  restricted to qualified academic/non-profit research institutions reviewed by CASD.
  **Commercial developers are ineligible.**

### 3.2 Scraping is a double disqualifier

Meta's Automated Data Collection terms: "You may not access or collect data from our Products using
automated means (without our prior permission)" and "Platform APIs are the only allowable means to
access data programmatically, unless you have our prior written permission." Platform Terms §3
prohibited practices, §7.e no circumvention. Combined with the hackathon rule disqualifying projects
that "violate platform policies" or "use code, data, or assets you do not have the rights to":

> **Scraping Marketplace would be a double disqualifier. Do not ship it and do not advertise it.**

Tokenless oEmbed (announced 2026-06-15) covers public Facebook/Instagram/Threads posts, pages and
reels — **not Marketplace listings**, and it is not a price source.

### 3.3 Third-party search APIs — lead-time reality

Closed or retired, do not plan around them:

- **Google Custom Search JSON API** — **closed to new customers**, migrate by 2027-01-01.
- **Bing / Azure Custom Search** — **retired 2025-08-11**.
- **Content API for Shopping** → **Merchant API** (manages your own feed, not graph search; the
  Content API dies 2026-08-18).
- **Amazon PA-API** — needs an Associates account with recent qualifying sales. **Weeks of lead
  time; impossible in 10 days.**

Self-serve, same-day options: **SerpApi** Google Shopping / Shopping Light (instant key; returns
title, price, link, image; free trial tier; paid from ~$50/mo; `gl`/`hl`/`location` params —
**verify on day 1 that `gl=ZA` returns local results in ZAR**), Brave Search API, Serper,
DataForSEO, Exa/Tavily. These are scraping intermediaries; they are defensible because **they**
carry the collection licence.

### 3.4 South African retailers

Takealot / Superbalist expose a **Seller API** (your own offers only), not public catalogue search;
Takealot's affiliate program appears **inactive (secondary source, uncertain)**. Checkers / Sixty60
have **no public API**. SA price data exists only via third-party scrapers (Apify PriceCheck ZA and
Sixty60 actors, Buyly, AZ Labs grocery API) — fast to sign up for, but their upstream legality
becomes your risk, and **the "no rights to data" rule covers data assets, so never commit scraped
JSON dumps to the repo.**

### 3.5 Verdict (the feature design)

1. **Primary:** Meta Model API **`web_search` grounding** — Meta's own product legitimately doing
   the web lookup, and it scores on the "Use of Meta AI tooling" axis.
2. **Layer:** user-pasted **link expansion** — normal HTTP plus `og:image` / `og:price:amount` and
   schema.org `Product` / `Offer` JSON-LD from the retailer page **the user** supplied. That is your
   own fetch of a user-directed URL, not Meta data — clean.
3. **Optional:** one self-serve SERP API as a structured fallback.
4. **Deterministic demo path:** a small hand-checked **ZA fixture index** (5–10 items, ZAR, manually
   collected URLs) shipped with a `SOURCES.md` that marks it as a fixture.
5. **Copy rule:** rename the feature everywhere from "searches Marketplace" to
   **"searches the open web for better deals"**.

- Sources: https://developers.facebook.com/docs/marketplace/partnerships/itemAPI/,
  https://developers.facebook.com/docs/content-library-and-api/content-library-api/guides/fb-marketplace/,
  https://developers.facebook.com/docs/content-library-and-api/get-access/,
  https://developers.facebook.com/documentation/development/terms-and-policies/automated-data-collection,
  https://www.facebook.com/legal/automated_data_collection_terms,
  https://developers.facebook.com/terms/dfc_platform_terms/,
  https://developers.facebook.com/blog/post/2026-06-15/tokenless-access-to-meta-oembed-apis/,
  https://dev.meta.ai/docs/search-grounding,
  https://developers.google.com/custom-search/v1/overview,
  https://developers.google.com/shopping-content/guides/quickstart,
  https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement,
  https://affiliate-program.amazon.com/help/node/topic/GVJ2BJP35457CLML,
  https://serpapi.com/google-shopping-light-api,
  https://github.com/api-evangelist/takealot

---

## 4. Consolidated UNVERIFIED register

Re-verify each of these before it becomes a dependency. None of them may be written into the
architecture as fact.

| # | Item | Impact if wrong | Verify by |
|---|---|---|---|
| 1 | `web_search` grounding available to a **South African** account | Deal-finding feature has no primary engine | Day 1, one API call |
| 2 | Credit card required before any Model API call (hackathon PDFs say yes, dev docs untested) | No API access until billing set up | Day 1, Billing page |
| 3 | Test-number recipients needing pre-approval in a console "Send To" list | Webhook demo fails | Day 1, WhatsApp console |
| 4 | Cursor + Muse Spark as an OpenAI-compatible custom provider | Coding-agent setup time | Day 1 |
| 5 | Sandbox templates skipping review | 24h approval latency on the critical path | Day 1, submit templates |
| 6 | `meta-models/muse-spark-open-1026` string (only if the open-weight bonus is pursued) | Partner-inference calls 404 | Baseten channel |
| 7 | Takealot affiliate status | SA retailer deep-link plan | Secondary, low priority |
