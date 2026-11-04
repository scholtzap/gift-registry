---
title: OTP return path — email sign-in for a public circle
type: plan
status: implementing
priority: P1
rank: 5
updated: 2026-11-04
apps: []
related:
  - docs/plans/registry-network-discovery-deviations.md
  - docs/plans/archive/shared-registry-and-circles.md
  - docs/plans/owner-circles-return-home.md
evidence: operator decision 2026-11-04 (WhatsApp OTP dropped; email OTP; Resend; email required; plus-tags kept; one discoverable flag); interview 2026-11-04 return-home extends hub/landing/dashboard IA
archived_date: null
supersedes: null
superseded_by: null
---

# OTP return path

Email send and uniform find/verify security stay here. Hub/landing copy, signed-in
`/app` dashboard, **Gifts for you** / **Gifts for others**, and navigate-back are
owned by [`owner-circles-return-home.md`](owner-circles-return-home.md) (ready P0).

WhatsApp OTP is not the return path. Meta WABA (Scholtz.Work) has Business
Verification not started, cannot create authentication templates, and only
has a test number. Sign-in codes go by email. `/app/find` takes one field,
an email or a phone. When that matches a user with email who owns an active
circle, has an active membership, or created a proxy circle, the code is sent
to that email (discoverable ignored — see Decisions). Every other case
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

## Live sending (blocked on the key)

The sender in `deliver.ts` is the live path. On the VM (presence only, 2026-11-04):
`DEMO_MODE=off`, `RESEND_API_KEY` set, `OTP_FROM_EMAIL` set on `scholtz.work`.
Both that key and vault `RESEND_API_KEY` (`repo=shared`, `env=single`) are rejected
by Resend (`HTTP 401` on `/domains` and `/emails`). A code is still stored and the
page stays uniform; `deliverLoginCode` logs `otp_send_failed`. Do not switch to the
3BO or hotmail Resend keys. A new key has to be minted in Resend, stored as
`RESEND_API_KEY`, and the domain `scholtz.work` has to show verified before a
message leaves the server. Do not print the key or the From address.

WhatsApp webhook and media env vars stay. They are not the sign-in channel. There is no `WHATSAPP_OTP_TEMPLATE_NAME`.

## Out of scope

Cross-row identity merge, OTP on the friend join gate, proxy-circle creator email, a post-create discoverable editor, WhatsApp template approval, deleting VM rows, redeploy.
