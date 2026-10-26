---
title: Meta integration setup checklist (day 1)
type: runbook
status: active
priority: P1
rank: 2
updated: 2026-10-26
---

# Meta integration setup checklist

Run top to bottom on **day 1 (Mon 26 Oct)**. Items marked **GATE** block downstream work. The ordering is
deliberate: everything with an external approval clock goes first so it runs while you build.

## A. Infrastructure

- [ ] Confirm the Oracle ARM VM is reachable by SSH and has Docker + Compose v2 installed.
- [ ] Add an A/AAAA record for `circles.<yourdomain>` in Cloudflare (DNS-only first, not proxied — Caddy needs
      HTTP-01 or DNS-01 to reach the box).
- [ ] Open ingress 443 (and 80 for redirect) in the Oracle **security list**; confirm the VCN route table.
- [ ] Caddy with the Cloudflare DNS provider for a DNS-01 cert. **GATE:** `curl -I https://circles.<domain>/healthz`
      returns 200 with a valid cert.
- [ ] `docker compose up -d` brings up `postgres:16`, `app`, `worker`. Postgres and the app bind to the compose
      network, **not** the host.
- [ ] Nightly `pg_dump` cron to a second disk + a one-command `pg_restore` runbook line, written before the first
      migration exists.

## B. Meta Model API

- [ ] Sign in via SSO; **attach a payment method**. The participant guide states a card is required to make any
      call, so this is a prerequisite, not a risk.
- [ ] Submit the credits form for the $150 grant; distribution is batched, so do it today.
- [ ] Set a **Spend Limit** notification on the Billing page.
- [ ] Create an API key (prefixed `LLM_`). Store it in the vault under `meta/model-api` with `envvar=MODEL_API_KEY`.
      Never in `.env` in a public repo, never in the image.
- [ ] `GET https://api.meta.ai/v1/models` — **GATE:** returns a non-empty list **from your South African account**.
      Record which of `muse-spark-1.3`, `muse-spark-1.2`, `muse-wonder-1.0`, `muse-image-1.0`,
      `muse-voice-transcribe-1.0`, `sam-3.1` are actually enabled for your team.
- [ ] One flat `json_schema` text completion through `/v1/responses` and confirm `response_format` /
      `text.format` behaves. Note: **recursive schemas return HTTP 400** — assert flatness in a unit test.
- [ ] Ask in `#office-hours` if `web_search` grounding is unavailable to your account, and whether
      `muse-spark-1.2` or `1.3` is preferred for audio in the window before the 1.3 caveat is resolved.
- [ ] **Optional, for the coding-agent angle:** Claude Code is documented against the API
      (`ANTHROPIC_BASE_URL=https://api.meta.ai`, `ANTHROPIC_AUTH_TOKEN=$MODEL_API_KEY`, `ANTHROPIC_MODEL`,
      `CLAUDE_CODE_SUBAGENT_MODEL`). **Cursor is not mentioned in Meta's docs** — if Cursor-as-provider is part of
      your workflow claim, verify it yourself today rather than assuming it.

## C. WhatsApp Cloud API

- [ ] Create the Meta app (Business) and enable WhatsApp. Note the auto-created test business phone number and the
      test Messaging account.
- [ ] **GATE — the single most likely demo blocker:** in the console, determine whether the test number can only
      message **pre-added "Send To" recipients**, and whether it can *receive* from numbers that did not opt in.
      Test with a second real device, not a screenshot.
- [ ] Register the webhook: HTTPS URL from step A, a verify token stored as a secret, subscribe to `messages`.
      **GATE:** `hub.challenge` echo passes and Meta shows the subscription as active.
- [ ] Verify `X-Hub-Signature-256` checking against an app secret on a real inbound payload.
- [ ] Inbound smoke test from a real phone: send text, then a photo, then a **voice note**.
- [ ] Confirm the voice note arrives as `audio/ogg; codecs=opus` and download the bytes via
      `GET /{media-id}` — the returned URL is valid **5 minutes** and the media id itself dies at **7 days**.
      Store bytes on ingest; record `media_expires_at`.
- [ ] Bake `ffmpeg` into the image and prove `ogg/opus → RIFF/WAVE mono 16-bit PCM 16 kHz` on the **real**
      WhatsApp file, not a synthetic one. This is the input `muse-voice-transcribe-1.0` accepts.
- [ ] Submit the **authentication** template (one-tap autofill variant, `code_expiration_minutes` set deliberately,
      1–90 allowed). ≤24 h review, can reject. Wire the OTP path only if it approves.
- [ ] Confirm +27 is on the authentication-international rate card and note the per-message cost.
- [ ] Put opt-in language and the business name on the gated link page — required for any template send.
- [ ] Decide the outbound nudge posture: in-window free-form where possible, utility templates otherwise. Watch for
      reclassification to **marketing**, which is immediate if previously warned.
- [ ] Implement user identity keyed on **BSUID** with phone fallback from the first commit. Phone is omitted from
      webhooks for users with usernames.
- [ ] Do **not** integrate the WhatsApp Groups API. It needs an Official Business Account, caps at 8 participants,
      the business must create the group, and it cannot post into a friend's existing group. The product shares a
      link instead.

## D. Repo and KB

- [ ] GitHub repo `scholtzap/gift-registry`, **public**, with LICENSE and a judge-runnable README.
- [ ] Add `NOTION_API_KEY` as a repo Actions **secret** (not a variable). `NOTION_ROOT_PAGE_ID` is non-secret and
      lives in the workflow.
- [ ] First Notion sync fires and the `_Sync Registry` page appears under the Gift Registry hub.
- [ ] Pre-commit hook active; gitleaks still runs globally — never `--no-verify`.
- [ ] Confirm no real phone numbers appear anywhere: `git grep -nE '\+27[0-9]{8,9}'`.

## E. Meta MCP (WhatsApp Business Tools)

The Meta MCP exists to set up a WABA conversationally from an IDE agent (Cursor / Claude Code / Codex). Worth
using **once**, on day 1, to shortcut console clicking — not as a runtime dependency.

- [ ] Check whether the Meta MCP server is available to your harness and whether it authenticates via Meta account
      OAuth (a second identity surface — decide deliberately, since it grants app-management access).
- [ ] If used: let it create the app, enable WhatsApp, and register the webhook, then **verify each artefact in the
      console yourself**. An agent-reported "created" is not evidence it exists with the right permissions.
- [ ] Keep the MCP out of the submitted product. Judges score what the app does with Meta models, not what tooling
      set it up — and the demo must show only your own build.
- [ ] **Do not** use the MCP to attempt Marketplace or Graph commerce access. Nothing it can reach makes
      Marketplace collection lawful.
- [ ] If it needs a Meta Business account you do not already control, skip it and use the console directly. A
      multi-day business-verification detour is not worth an hour of saved clicking.

**Recommendation:** try it for 20 minutes on day 1 for app + webhook setup. If it does not clearly win over the
console by then, drop it — the Claude Code path against the Model API is the documented, verifiable one, and Cursor
is **not** mentioned in Meta's coding-agent docs despite the brief assuming it.

## F. Explicitly not doing

Facebook Login, Marketplace access of any kind, Meta Content Library (academic-only), Instagram/Messenger,
Business Verification (not needed for the sandbox and it takes days), native apps, payment processing.
