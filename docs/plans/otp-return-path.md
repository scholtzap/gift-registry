---
title: OTP return path — email sign-in for a public circle
type: plan
status: implementing
priority: P1
rank: 5
updated: 2026-11-04
apps: []
related: [docs/plans/registry-network-discovery-deviations.md, docs/plans/archive/shared-registry-and-circles.md]
evidence: operator decision 2026-11-04 (WhatsApp OTP dropped; email OTP; Resend; email required; plus-tags kept; one discoverable flag)
archived_date: null
supersedes: null
superseded_by: null
---

# OTP return path

WhatsApp OTP is not the return path. Meta WABA (Scholtz.Work) has Business
Verification not started, cannot create authentication templates, and only
has a test number. Sign-in codes go by email. `/app/find` takes one field,
an email or a phone. When that matches the owner of an active **discoverable**
circle who has an email, the code is sent to that email. Every other case
answers the same way.

## Decisions (2026-11-04)

- **Resend** for live mail, using vault `RESEND_API_KEY` (`repo=shared`, `env=single`, folder `resend/scholtzap`). Do not use the 3BO or hotmail Resend keys. Live send stays off until the operator names `OTP_FROM_EMAIL` on a verified domain.
- **Email is required** on new circles. Phone is optional. Both may be stored. The code always goes to the email.
- **No legacy path.** Phone-only circles are not supported and are not backfilled. The operator said existing circles may be deleted. This change does not delete rows on the VM. A leftover row with no email gets the same find response as a miss, and nothing is sent.
- **Plus-tags stay.** Normalisation is trim, Unicode NFC, lowercase. `user+circle@example.test` and `user@example.test` are different keys. Dots are not folded.
- **Owner sign-in ignores `circles.discoverable`.** Follow-up the same day: "Open my circle" is the email code, and other people open `/c/<slug>`. Gating the code on the flag would force the owner back to the link whenever the box was off. The column stays (default false) and is not on the create form. `/app/open` is removed; a pasted link is not a sign-in path. Friends open `/c/<slug>` directly.

## Non-negotiables

- **Found, missing, private, and no-email are indistinguishable** in status, wording, body shape, and latency (fixed floor). The page echoes only what the person typed.
- **No plaintext secrets in logs.** Codes are hashed with a purpose-separated pepper. Email lookup uses an HMAC of `email:` + the normalised address (same `PHONE_HASH_PEPPER`, different message from phone hashes). The deliverable address stays plaintext on `users.email`, same as `users.phone_e164`, and both columns stay off the app-role grant.
- **Friends never see the email or the phone.** The find response never echoes the address on record.
- **Single-use, 10-minute, 5-attempt codes**, max 3 live codes per submitted identifier. Burn on success; burn out on exhaustion.
- **Request limits apply to the submitted identifier and the client address whether or not anything matched** (3/minute identifier, 60/minute address on find; 10 and 120 on verify). A separate cap allows 5 sends per recipient email-hash per hour. Over the cap, the page stays the uniform one and nothing is sent.
- **`DEMO_MODE=on` logs the code and sends nothing.** The log line is `otp_demo_code_issued` plus the code. It does not include the address. `DEMO_MODE=off` without `RESEND_API_KEY` and `OTP_FROM_EMAIL` answers uniform and logs `otp_send_failed` with `reason: missing_mail_config`.

## Live sending (not done)

Keep `DEMO_MODE=on` in `~/pinata-private/app.env` until all of these exist:

1. Operator confirms the Piñata sender may use vault `RESEND_API_KEY` (shared / single), not a 3BO or hotmail key.
2. Operator names the exact `OTP_FROM_EMAIL` on a domain they verify in Resend (a mailbox at `scholtz.work` or a subdomain). A Gmail address marked verified in the Resend account is the sandbox recipient, not a From. Resend rejects mail whose From is not on a domain this account has verified. The marketing site's contact function still defaults to Resend's shared onboarding address; that is not this sender.
3. DNS on that domain: SPF, DKIM, and DMARC, as Resend instructs for the verified domain.
4. Set `RESEND_API_KEY` and `OTP_FROM_EMAIL` in `~/pinata-private/app.env` (never git, never printed). Presence-check only.
5. Operator explicitly sets `DEMO_MODE=off`.

WhatsApp webhook and media env vars stay. They are not the sign-in channel. There is no `WHATSAPP_OTP_TEMPLATE_NAME`.

## Out of scope

Cross-row identity merge, OTP on the friend join gate, proxy-circle creator email, a post-create discoverable editor, WhatsApp template approval, deleting VM rows, redeploy.
