# MISTAKES.md — gift-registry

Agent error log. Newest entry first. No secrets, tokens, env dumps, or credentialed URLs.

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
