---
type: reference
status: current
priority: critical
source: Cerebral Valley event pages + participant guide PDF + Gmail event blasts
captured: 2026-10-26
title: Meta Global AI Developer Hackathon - rules, rubric and deadline constraints
---

# Meta Global AI Developer Hackathon — rules, rubric and deadline constraints

**Why this matters.** Every scope decision in this repo is priced against these constraints: the
10-day window, the "new work only" rule, the public-repo requirement, and a rubric where
Impact + Demo are 55% of the score.

The three source PDFs this doc was written from are kept **outside the repo**, in
`../gifts-registry-assets/hackathon/` (a sibling folder under `Documents/personal/`): two are
third-party branded page prints and one is a notification from a personal mailbox. This repo goes
public for the submission, so they live there and not in git — which is also why the links below
name files rather than link them. The page text was cut off in the printed tables, so where this doc
states a truncated fact it is marked.

- `Details – Meta Global AI Developer Hackathon – Cerebral Valley.pdf` — participant guide (rules, schedule, judging, prizes, credits).
- `Meta Global AI Developer Hackathon – Cerebral Valley.pdf` — public event page (themes, tracks, application criteria, eligibility).
- `Gmail - New Notification for Meta Global AI Developer Hackathon.pdf` — the two acceptance/credit event blasts.

## Dates (all Eastern Time)

| Date | What |
|---|---|
| Mon Oct 26, 12:00 PM | Kickoff: opening remarks, rules, prizes, judging, Meta speaker. |
| Tue Oct 27, 12:00–1:00 PM | Agents 101 — Build a Multimodal AI Agent (Suraj Subramanian). |
| Wed Oct 28, 12:00–1:00 PM | Agents 102 — Best Practices for Verifiable Agents (Yash Khare). |
| Fri Oct 30, 12:00–1:00 PM | Building Specialized Intelligence on Fireworks: inference→training with Muse Open models (Sinan Ozdemir). |
| Oct 27 – Nov 4 | **Building period.** Live workshops plus Discord office hours 10–11 AM ET on weekdays (text-only in `#office-hours`, no livestream). |
| Tue Nov 3 | Last full day for submission questions and technical troubleshooting. |
| **Wed Nov 4, 9:00 PM** | Final office hours **and submissions due** via the CV platform. Late submissions are not considered. Also the deadline to claim the $150 Meta Model API credits. |
| Nov 4 – Nov 8 | Judging period. |
| Mon Nov 9, 12:00 PM | Closing ceremony: top 10 announced (5 per track), live final-round judging, winners revealed, community vote opens. |
| Mon Nov 16 | Community vote winner announced on Discord. |

## Themes — the project must fit exactly one

1. **Build for Your World** — bring Meta's models into your domain; solve a problem you know
   firsthand; free up time and mental space; make something possible that wasn't before.
   → Gift Circles is this theme: a real coordination pain in South African group gifting.
2. **Push the Frontier** — software, robotics, manufacturing, energy, materials; give a machine
   a new capability or accelerate an experiment.

The project **must incorporate Meta's models**: the Muse Spark series, Muse Wonder, Muse Image,
Muse Voice Transcribe and SAM 3.1 via the Meta Model API; Meta open-weight models Muse Glimmer
and Muse Spark Open; and/or the Muse Code coding agent.

## Tracks and prizes ($1M total pool)

| Track | Pool | Placements |
|---|---|---|
| Indie Developer (individual builders and students; judged on creativity, technical ambition, whether it works) | $400K | 1st $150K, 2nd $100K, 3rd $75K, 4th $50K, 5th $25K |
| Startups (teams/founders with a real product; judged on technical execution and production-readiness) | $550K | 1st $250K, 2nd $150K, 3rd $75K, 4th $50K, 5th $25K |

Bonus prizes from Meta ($50K reserved):

| Prize | Amount | Rewards |
|---|---|---|
| Most Viral Project | $20,000 | Highest engagement on X after the event; post the demo/submission through the hackathon handles. |
| Best Build on Meta Open Weight Models | $10,000 | Best project built using Muse Glimmer or Muse Spark Open, served on own hardware or through partner inference. |
| Community Vote | $10,000 | Most votes in the public gallery; winner announced Nov 16. |
| Best Agentic Use-Case | $5,000 | Strongest use of AI agents to complete meaningful tasks, make decisions, or coordinate multi-step workflows (judges note effectiveness, real integration, practical usefulness). |
| Best Creative Build | $5,000 | Most original creative project built using Muse Image or Muse Wonder. |

## Judging: three stages

- **Stage 1 — pass/fail.** Does the project meet a baseline of viability: reasonably fit a theme,
  **and** reasonably use the Meta Model API and/or Meta open-weight models to build it during the
  hackathon.
- **Stage 2 — scored 0–10 per category**, weighted:

  | Category | Weight | What the judges are looking for |
  |---|---|---|
  | Impact | **30%** | Real-world potential; who benefits and how much it matters; could it actually be used; does it fit a stated problem statement. |
  | Use of Meta AI Tooling | **25%** | How creatively Meta's AI was used to go beyond a basic integration; did it surface something that surprised even Meta. |
  | Technical Depth & Execution | **20%** | Is the engineering sound and thoughtfully reflected; does it feel like something that was thought through. |
  | Demo | **25%** | Is this a working, impressive demo; does it hold up live; is the demo video genuinely cool to watch. |

- **Stage 3 — top 5 per track.** Final-round judges **watch the video demos live** and re-rank on
  the same rubric.

**Design consequence:** 55% of the score is Impact + Demo and only 20% is technical depth. Build
one deeply-used Meta integration that demos cleanly, not five shallow ones. Judge-facing: see the
rubric note in `AGENTS.md` ("Build discipline").

## Submission requirements

- Submit via the Cerebral Valley platform by **Nov 4, 9:00 PM ET**; teams submit **one** project,
  not one per person.
- One team member acts as the "Representative" who enters the submission.
- A **3-minute demo video** is required and is a primary judging artifact alongside the code and
  the live product. The video must highlight only the features, code and functionality built
  during the hackathon.
- Double-check that **the repository is publicly accessible**, the video link is accessible, and
  **everyone who worked on the project is listed** on the submission page.

## Hard rules (disqualifiers)

- **Open source:** repositories must be public.
- **Team size:** max 4; solo allowed.
- **Demo scope:** the demo must only show what was built during the event. If judges cannot
  clearly identify the original contribution → **immediate disqualification at judges' sole
  discretion**.
- **New work only.** Startups may build on an existing product but must clearly identify what was
  newly developed during the hackathon.
- **Banned:** projects that violate legal, ethical or **platform policies**, or that **use code,
  data, or assets you do not have the rights to**.
  → This is the rule that kills Marketplace scraping. See
    [`investigations/Meta-Model-API-and-WhatsApp-Cloud-API-findings.md`](investigations/Meta-Model-API-and-WhatsApp-Cloud-API-findings.md)
    and `MISTAKES.md`. Never commit scraped JSON dumps.
- **Anti-projects to avoid** (named as generic or policy-violating by the organisers): AI medical
  advice (e.g. mental-health advisor, skin-blemish detector), basic RAG apps, simple image
  analyzers, simple "AI for education" chatbots, AI job-application screeners, AI nutrition
  coaches, personality analyzers, sports analyzers or coaches, anything political or involving war.
- Duplicate applications, false identity information or spam are disqualified at the sponsor's sole
  discretion.

## Eligibility (applies to this account)

Open worldwide **except** where local law prohibits participation or receipt of an award, and
excluding targets of US/EU/UN/UK trade sanctions or export controls, anyone acting for them, and
individuals organised or located in Belarus, China, Russia, Ukraine, Syria, or comprehensively
sanctioned regions (Crimea, Donetsk, Luhansk, Cuba, North Korea, Iran). South Africa is not on the
excluded list. Meta/Cerebral Valley employees, contractors, interns, government-affiliated
individuals, their immediate families and household members are ineligible. Participation was
capped at 20,000 accepted applicants, reviewed on a rolling basis against (1) clarity/feasibility
and theme fit of the proposed project and (2) demonstrated technical skill — weighted equally.
Official rules were to be published on Oct 26 and must be accepted by selected participants.

## Credits and compute

- **$150 Meta Model API credits** for each accepted participant. Claim through the CV form;
  distribution is **batched**, so check the Billing page to confirm they landed.
  **Claim by Nov 4, 9:00 PM ET.** Every participant claims their **own** — cannot be claimed on
  someone else's behalf. Set a Spend Limit notification if you don't want to exceed $150.
- **The event blasts and the participant guide both state: "In order to use your credits & make an
  API call, a credit card must be applied to your account."** Treat the card as required. (This is
  still marked UNVERIFIED in the findings doc against Meta's own developer docs, which do not state
  it — see that doc's pricing/rate-limit section.)
- Inference partners (credits **not guaranteed**, at each partner's sole discretion, per
  individual unless stated):
  - **Baseten** — $100 credits **+ 2M TPM rate limit**, up to 2,000 participants, reviewed by use
    case, selected applicants emailed. **Model string gotcha:** the Baseten docs use
    `meta-models/muse-spark-open`; for the hackathon use **`meta-models/muse-spark-open-1026`**.
  - **Modal** — $100 credits, first 1,000 participants, for Meta open-weight models through
    Endpoints plus serverless GPUs, sandboxes, LLM training tools.
  - **Fireworks** — $25 credits **per team**, shortlist of select teams reviewed with Fireworks,
    emailed redemption details.

## Community channels

Discord (`#general`, `#announcements`, `#intros`, `#team-search`, `#questions` for Cerebral Valley,
`#office-hours` for the Meta team). Sessions stream live on the Cerebral Valley platform; the
stream link goes public shortly before each session.

## Demo-day implications for this repo

1. **Repo must be flipped public before submission** — currently local only, no remote yet.
2. **The 3-minute video is 25% of the score by proxy** and is what Stage-3 judges watch live.
   Every headline feature needs a deterministic offline fallback so a key or network failure
   during recording does not kill the demo.
3. **The $150 credit claim and the card requirement are day-1 blockers**, not day-10 tasks —
   batched credit distribution means calling the API before Nov 1 may fail.
4. **Office hours run to Nov 3** — post the WhatsApp test-number "Send To" allowed-list question
   there early; it is the most likely demo blocker.
