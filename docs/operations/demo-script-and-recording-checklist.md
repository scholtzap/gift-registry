---
title: Demo script and recording checklist
type: runbook
status: active
priority: P1
rank: 3
updated: 2026-10-26
---

# 3-minute demo script

**Rules constraint:** the video may only show what was built during Oct 26 – Nov 4, and judges must be able to
identify your original contribution — failure to do so is disqualification at their discretion. Say plainly what is
yours. Top-5 teams have judges watching these **live** on Nov 9, so it has to hold up without you present.

**Cast:** fictional. "Nadia" is the gift-target, Thabo/Lerato/Sibusiso are friends. Real SA retailer product URLs,
no real people. Recorded from the deployed URL, never localhost.

| Time | Beat | What is on screen | What it proves |
|---|---|---|---|
| 0:00–0:18 | The two-sided problem | Split screen: a group chat asking "what do you want?" and two people buying the same helmet | Impact (30%). Nobody else's wishlist tool handles the money side |
| 0:18–0:35 | Owner creates a circle | Circle "Nadia's 30th", the gated link + QR, pasted into a real WhatsApp group | No app download. The link is the onboarding |
| 0:35–1:00 | **Voice note intake** | Phone sends "I'd love the Specialized Torch cycling shoes, size 43" → transcript → structured draft → tap confirm | Meta `muse-voice-transcribe-1.0` + `muse-spark-1.2`. Real inference, live |
| 1:00–1:18 | Link intake | Paste a Takealot URL → title, ZAR price, image populate; then a screenshot → vision draft | Three intake surfaces, one pipeline |
| 1:18–1:40 | A friend joins | Second device, tap the link, allowlist match, session. Item list **plus** Nadia's shareable sizes | The gate works on someone else's phone; attributes stop a wrong-size buy |
| 1:40–2:05 | Claim and pool | Thabo claims one item solo. Lerato + Sibusiso pool R2,400 behind Thabo as the single buyer; contributions mark, pool hits `funded` | The thing Giftster cannot do |
| 2:05–2:25 | **The money shot** | Hard cut to Nadia's own screen: the same items, still just "wanted". No claim, no pool, no contributor. Nadia deletes one, answers "I bought it myself" | Owner blindness, live. And the ledger survives: friends see `pivot_needed` |
| 2:25–2:40 | **The card** | Same pool, now `purchased`: the friends open the gift card — Nadia's name, the pun, every contributor's name with their own message — download it, and the cut lands on the printed card taped to the box | The loop closes. This is the artefact the recipient actually receives, and the emotional payoff of the whole product |
| 2:40–2:52 | Why it can't leak | The RLS policy and the leak-suite run green in CI — including the row where the owner's session gets 404 on that card URL | Technical Depth (20%). Blindness is structural, not a UI courtesy |
| 2:52–3:00 | Close | Repo URL, live URL, one line on what was built in ten days | Demonstrates original contribution as the rules require |

**Deliberately not claimed in the video:** Marketplace (not used — prohibited), outbound nudges (in-app badges
unless the template approved), Stripe (no money held).

## Pre-recording checklist (run every take, day 9)

1. `docker compose down -v && seed` succeeds, and the demo state is identical to the previous run.
2. `https://circles.<domain>` loads on a phone, logged out, on cellular (not just wifi) — proves the URL, not the LAN.
3. Both secondary devices/sessions are authenticated as the right seeded friends before rolling.
4. Model API key live, spend alert set, and one intake run executed successfully within the last 10 minutes.
5. Webhook delivering: an inbound test message produced an `ingest_events` row with `model_used` populated.
6. Leak suite green in CI on the exact commit being shown.
7. **Card audience check:** paste the circle link into a real WhatsApp group that contains the owner session and
   confirm the delivered link preview shows **no contributor name and no card**; then hit the card URL and the card
   PNG from the owner's session and confirm 404, not 403; then confirm the card response carries no `og:` tags and
   `Cache-Control: private, no-store`.
8. Notifications, calendar, Slack/Discord and the personal phone number silenced; screen recording shows no
   browser profile with real contacts.
9. Nothing in view that contains a real name or number — including browser history, autofill, and Notion tabs.
   The card on screen uses the fictional cast only.
10. The fallback deck (still frames of a successful run) exists before you press record.

**Insurance:** the day-3 vertical-slice capture is committed as the fallback asset. If day 9 goes badly, that
clip plus the fallback deck still shows the spine working.

## Submission package

- 3-minute video, viewable by a logged-out account.
- Public repo with LICENSE and a README a judge can run.
- Live URL, still up through Nov 8.
- All contributors listed (solo here).
- Nothing about a real person in any of the above.
