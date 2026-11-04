# Plans index

<!-- plans-registry-generated -->

**Do not edit.** Regenerate:

```bash
python scripts/ops/refresh_plans_index.py --write
```

Generated: 2026-11-04 12:18 · repo: `gifts-registry`

## P0

| Rank | Title | Status | Path | Next |
|------|-------|--------|------|------|
| 3 | UX CR-01: one entry door and a self-serve create-circle (registration) flow | done | `ux-entry-and-registration.md` |  |
| 3 | UX CR-02: put the lookup/proxy creation flow inside the app shell | done | `ux-lookup-shell.md` |  |
| 4 | Owner circles return home — login, multi-circle dashboard, navigate back | ready | `owner-circles-return-home.md` | None from the interview. Implementation may surface `[TODO: needs clarification]` only if |

## P1

| Rank | Title | Status | Path | Next |
|------|-------|--------|------|------|
| 1 | Gift Circles ten-day build plan | implementing | `gift-circles-ten-day-build-plan.md` |  |
| 2 | AI capability entitlements and the single can() gate | implementing | `entitlements-and-capability-gate.md` |  |
| 2 | Piñata parallel build and verification closeout | implementing | `parallel-build-closeout.md` |  |
| 3 | Day-2 remaining-work inventory handover (voice-to-deploy queue) | implementing | `day-2-inventory-handover.md` | - First two-minute user item: §1.5 — send one message to the sandbox number and record whether |
| 4 | Design system, brand round and the seven in-app screens | ready | `design-system-and-brand.md` |  |
| 4 | Next high-value work after site sign-up CTA and app deployment | ready | `next-high-value-work.md` | 7. **Retire the batch form once live WhatsApp intake works.** Done for the |
| 5 | Handover finish-line outcome (site DNS, app follow-ups, remaining gates) | done | `handover-finish-line-outcome.md` |  |
| 5 | OTP return path — email sign-in for a public circle | implementing | `otp-return-path.md` |  |
| 5 | WhatsApp task-bot surface — six bounded tasks, fixed menu, no free chat | ready | `whatsapp-task-bot-surface.md` |  |
| 6 | Day-3 nine follow-ups (throttle, creation, pun, reveal, dispatch, landing) | implementing | `day-3-nine-followups.md` |  |
| 6 | Pool payout details, amounts-due share, and pledge visibility | done | `pool-payout-details.md` |  |
| 6 | UX CR-06: align site/guide/app copy with what is actually live | done | `ux-copy-alignment.md` |  |
| 6 | UX CR-04: join-gate error recovery | done | `ux-join-recovery.md` |  |
| 6 | UX CR-03: fix or remove the broken screenshot strip | done | `ux-landing-strip-assets.md` |  |
| 12 | Registry-network tracks — order, dependencies and what can run in parallel | ready | `rn-tracks.md` |  |
| 13 | RN-I — submission-window triage: what of the registry network fits before 2026-11-04 | ready | `rn-i-submission-window-triage.md` |  |
| 14 | RN-A - proxy registry data model and authority rules | ready | `rn-a-proxy-registry-spec.md` | - **Pepper: distinct.** `recipient_phone_e164_hash` uses a separate `PHONE_HASH_PEPPER`, not |
| 15 | RN-D - abuse and threat model for phone lookup and proxy registries | ready | `rn-d-abuse-model.md` | - Who answers G1? **ANSWERED 2026-10-27 (owner, Wave 0): create-only.** RN-B takes a number and |
| 23 | Demo video validation — the 3-minute loop, replayed by Playwright before recording | ready | `demo-video-validation.md` |  |

## P2

| Rank | Title | Status | Path | Next |
|------|-------|--------|------|------|
| 3 | Gift card (F10) — group card with every gift-giver's name and message | implementing | `gift-card-f10.md` |  |
| 6 | Photo to cutout candidates on SAM 3.1 (intake and card art) | ready | `vision-cutout-intake.md` |  |
| 7 | Post-event reveal of secret suggestions (F14) | implementing | `post-event-reveal.md` |  |
| 8 | User management, the path to paid, and which open source to adopt | ready | `user-management-and-billing-path.md` | 1. **D4, the owner session.** Bot-minted or script-minted for the recording? Decide with the cast on day 7. |
| 8 | UX CR-05: owner date form and in-app navigation targets | done | `ux-owner-date-and-nav.md` |  |
| 16 | RN-B — the resolution lookup route: one key in, always 200 out | backlog | `rn-b-lookup-route.md` | Does the found branch render inline or redirect to `/c/<slug>`? (A redirect re-introduces the slug oracle.) Is the |
| 17 | RN-C — proxy circle creation, its share link, and the RLS that breaks without it | backlog | `rn-c-proxy-circle.md` | Does the creator gifter get any elevated right, or are they a plain member (RN-A says plain member — confirm it |
| 22 | RN-J — ask for access: the permission request and the owner inbox that is never pushed | draft | `rn-j-permission-request.md` |  |
| 30 | Shared registry and circles dashboard — canonical items, link rows, per-circle visibility | draft | `shared-registry-and-circles.md` | None. All Q1–Q11 answered 2026-11-01. |

## P3

| Rank | Title | Status | Path | Next |
|------|-------|--------|------|------|
| 9 | Public landing page at / and the /app route move | done | `public-landing-page.md` | - Unlisted YouTube (needs network during Nov 5–8 judging) or self-hosted MP4 on the VM (bandwidth we do not have much |
| 18 | RN-E — circle lifecycle: a once-off registry that archives itself after the day | ready | `rn-e-lifecycle-archive.md` |  |
| 19 | RN-F — promoting a proxy circle when the recipient later joins | out-of-window | `rn-f-claim-merge.md` |  |
| 20 | RN-G — find-a-friend as a bounded WhatsApp bot task | draft | `rn-g-bot-find-task.md` |  |
| 21 | RN-H — on-platform search vs the noindex guarantee | out-of-window | `rn-h-crawlability.md` |  |
| 40 | Deferred feature spikes (deal-finding, coordination agent, SAM duplicates) | backlog | `deferred-feature-spikes.md` |  |
| 900 | Registry network - discovery, public visibility, and the deviations from the shipped spine | draft | `registry-network-discovery-deviations.md` | - G1 (RN-D): is the lookup **create-only** inside the submission window, given there is no visibility field yet for |

## Archive (`archive/`)

| Title | Status | Path |
|-------|--------|------|
| Shared registry and circles dashboard — canonical items, link rows, per-circle visibility | implemented | `archive/shared-registry-and-circles.md` |

