---
title: Next high-value work after site sign-up CTA and app deployment
type: outcome
status: ready
priority: P1
rank: 4
updated: 2026-10-28
apps: []
related: [docs/plans/public-landing-page.md, docs/deployment/oracle-vm.md]
evidence: PR #19 (site), PR #20 (subpath), VM deploy log 2026-10-28
archived_date: null
supersedes: null
superseded_by: null
---

# Next high-value work

State at 2026-10-28: the marketing site leads with sign-up (`/`, `/guide`,
`/privacy` on gifts.scholtz.work), and the app deploys on the shared Oracle VM
under `pinata.scholtz.work/app` in DEMO_MODE with the seeded fictional cast. Primary site CTAs now point at the live app (PR #27).
What follows is ordered by value for the 2026-11-04 submission, then for real
users. Each item names its blocker and the exact steps to clear it.

## Outstanding (submission)

1. **Record the demo video.** Blocker: human act only.
   1. Confirm `main` is green: `pnpm typecheck`, `pnpm leak`, `pnpm test`,
      `pnpm exec playwright test tests/browser/demo-loop.spec.ts`.
   2. Follow `docs/operations/demo-script-and-recording-checklist.md` against
      `pinata.scholtz.work/app/c/nadia-30th`; fictional cast only.
   3. Re-verify no real names or numbers appear in any frame.
2. **Flip the repo public.** Blocker: owner's publish call.
   1. `git grep -nE '\+27[0-9]{8,9}'` on main (clean 2026-10-28; re-run).
   2. Check no `.env` or secret file is tracked: `git ls-files | grep -i env`.
   3. GitHub → Settings → Danger Zone → Change visibility → Public.
3. **Submission form + Community Vote gallery.** Blocker: video URL (item 1).
   1. Upload the video (unlisted is fine), paste the link into the form.
   2. Use the committed diagram PNGs in `docs/diagrams/` for the gallery.

## Blockers (product)

4. **Live WhatsApp intake (DEMO_MODE off).** Blocker: Meta credentials + OTP.
   1. Complete Meta Business Verification; submit the authentication OTP
      template and wait out the conversation-tier limits (see
      `docs/plans/rn-f-claim-merge.md`). Owner-only, starts a clock — start now.
   2. Put `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`,
      `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` and
      `META_API_KEY` in the vault, then into `~/pinata-private/app.env` on the
      VM (never in git).
   3. Set `DEMO_MODE=off`, recreate app + worker, send one voice note to the
      business number, confirm a draft appears, confirm it, check the item.
5. **Oracle ingress proof.** Blocker: OCI security list, if 443 is closed.
   1. From outside: `curl -v https://pinata.scholtz.work/app/health`.
   2. If it times out, OCI Console → the VM's VCN → Security Lists → add
      ingress `0.0.0.0/0` TCP 443 (and 80 if HTTP-01 is wanted).
6. **Backups and recovery drill.** Blocker: none; just untested.
   1. Nightly `pg_dump` of the Compose Postgres to a second location.
   2. Restore it into a scratch database once and run `pnpm leak` against it.
   3. Write the restore commands into `docs/deployment/oracle-vm.md`.

## Next high-value tasks

7. **Retire the batch form once live WhatsApp intake works.** Done for the
   CTA itself (PR #27: primary buttons point at the app; `#start` is now the
   email alternative). When DEMO_MODE goes off, delete `#start` or turn it
   into a help form.
8. **Serve the app landing at `/app` with the demo video embedded** (the
   `docs/plans/public-landing-page.md` F15 shape), once the video exists.
9. **GitHub Actions re-enable or a local CI script.** Actions is billing
   blocked today; a single `pnpm gate` script (typecheck + leak + test +
   build) run before every merge is the cheap substitute.
10. **Real-user pilot with one friendly circle.** One real birthday, owner
    consent, support watches the first pool end to end. This is the fastest
    way to find the join-gate and pool-copy problems the fixtures cannot.
