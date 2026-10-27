---
title: RN-D - abuse and threat model for phone lookup and proxy registries
type: spec
status: ready
priority: P1
rank: 15
updated: 2026-10-27
apps: []
related: [AGENTS.md, docs/plans/rn-a-proxy-registry-spec.md, docs/plans/rn-tracks.md, docs/plans/registry-network-discovery-deviations.md, docs/plans/rn-i-submission-window-triage.md, docs/deployment/oracle-vm.md, security_best_practices_report.md]
evidence: 'src/server/auth/throttle.ts:1-3,6,10,18-27,32-34; tests/routes/throttle.test.ts:6-41; src/server/routes/circle.ts:32-34,43-48,62-68,74-77,171-174,294-296,397-423,453-455; src/server/auth/phone-hash.ts:13-23,26-32; src/server/auth/session.ts:23,49,52-62; src/lib/env.ts:13-17; prisma/schema.prisma:136,197-216,221,229,368; src/server/db/policies/001_roles.sql:50-63; src/server/db/policies/002_policies.sql:29-35,60-68,344-349; src/server/views/index.ts:117-140; src/server/ledger/index.ts:132,149-190; src/server/wa/http.ts:29; src/server/wa/media.ts:14; src/server/models/client.ts:40,63; docs/deployment/oracle-vm.md:12,45,83-91; docs/deployment/Caddyfile.example:20-25; security_best_practices_report.md:153-165,283-290; AGENTS.md:19,25,42; registry-network-discovery-deviations.md:40,73-74; rn-a-proxy-registry-spec.md:41,58,69-71,102-105,143-145'
archived_date: null
supersedes: null
superseded_by: null
---

# RN-D - abuse and threat model for phone lookup and proxy registries

**Status:** Draft. RN-A decides the data model and hands caps here (`rn-a:71`) and the pepper question (`rn-a:143-145`); this file gates RN-B (`rn-tracks.md:34`) and changes nothing in RN-A. One divergence: RN-A `D6` is right about *proxy* circles and silent about the *found* branch, which is where the oracle actually lives.

## 1. Enumeration, revisited - always-200 moves the oracle, it does not close it

`circle.ts:32-34` and `notFound()` (`:62-68`) make every *negative* indistinguishable, which is why the gate cannot walk a phone list (one message for every kind of no, `:420-423`). A lookup answering "found → their registry" lacks that property: **two bodies is a 1-bit oracle**, and uniform status only hides the answer from a caller who reads status, which nobody does. Channels, priced:

- **Body content and size** - decisive, and it *is* the feature. The shell is already byte-identical by rule (`:74-77`), so the whole delta is body: one `curl | wc -c`. No mitigation short of §8.
- **Timing** - found runs the friend projection (items, claims, pools, contributions, `views/index.ts:117-140`), not-found renders a form: milliseconds vs sub-millisecond, separable with a few hundred samples over the open internet and no signal processing. `timingSafeEqual` (`phone-hash.ts:19-23`) equalises a hash comparison *inside* one circle and buys nothing across branches.
- **Error strings** - three notices already ship (`:404`, `:409`, `:422`) and `unavailable()` answers 503 on any throw (`:453-455`), so an error reachable only on a *found* circle makes 503 an oracle. Rule: one notice string; lookup throws fold into the same 200 body.
- **The share link that comes back** - the worst one, because it converts a phone oracle into a bearer credential: `/c/<slug>` resolves on the slug alone (`:171`, `:294`) and slug existence is *already* a public 404-vs-200 oracle (`:172` unknown → 404 vs `:174` known → 200 gate; logged as L-06, `security_best_practices_report.md:283-290`, whose cited lines have since drifted). **No lookup body may contain a `shareSlug` string or a `/c/` href** → test `tests/routes/lookup.test.ts` "a found render echoes no slug", built like the existing gate assertion that the slug is never echoed into markup (`circle-link.test.ts:145-155`).
- **Duplicate vs fresh create** - RN-A already accepts split money as the price of not distinguishing them (`rn-a:102-105`), so an unauthenticated create on an already-proxied number must mint a new circle, not fail. Keep it: a `@@unique` on `recipient_phone_e164_hash` would make "already squatted" a fresh oracle. §2 pays for that instead.
- **Rate-limit behaviour** - `throttle.ts:8` already prescribes counting successes and failures alike, so a denial is number-*independent* provided the mount obeys it; the 6th denial must be byte-identical resolved or not.
- **Honest cost** - bulk harvest is not the threat. SA mobiles are ~10^8 (`phone-hash.ts:30`, 9-15 digits, per `rn-a:69-71`), so 5 req/min/IP is a week of work per address for a list nobody wants. The real attack is **targeted**: one person checking five named people, one request each, which no throttle touches. A control that only taxes bulk volume guards an attack nobody is running.

## 2. Namespace squatting and impersonation

`proxy_created_by_user_id` exists as a column (`rn-a:58`) but RN-A never says it renders, and the creator otherwise sits in the roster as a plain `friend` (`rn-a:41`, `002_policies.sql:60-68`), indistinguishable. The harm to the named person: a free-text `occasion` and `recipient_label` attached to a fabricated gift drive, circulated in a group they are actually in, and - because the recipient is never notified by design (`AGENTS.md:25`) - they can neither learn it happened nor object. No takedown path exists.

**M1: the proxy friend projection renders the creator's `display_name` plus one literal sentence** - "Set up by <name>, who has not confirmed this with the person it is for." Projection: **friend only**; a proxy circle has no owner projection structurally (`rn-a:32-40`, `002_policies.sql:29-35`), so AGENTS.md's declare-the-projection rule is discharged by saying *friend*. Display name only - `users.phone_e164` stays revoked from both app roles (`001_roles.sql:50-63`). One join, one string, and it is the control doing work in §2, §3 and the judge story at once → test `tests/routes/lookup.test.ts` "a proxy circle attributes itself to its creator, not to the recipient", on the rendered body.

**M2: creation requires a gated creator** - a user already holding a session, minted only through the allowlist gate (`circle.ts:425-443`), so the creator self-declares their own number like every friend. Squatting stops being an internet-wide surface and becomes attributable; it is also the only honest way to render M1.

## 3. Money

No money is held (`AGENTS.md:19`), and the figure a proxy circle shows is not a balance: `settledMinor` sums only contributions at status `settled`, written solely by `purchasePool` (`views/index.ts:117-119`, `ledger/index.ts:189-190`), while `promised` never enters a total (`:132`, `:149`). A proxy circle cannot lie about custody because it asserts none. **The fraud vector is credibility, not custody** - the attacker's real prop is our own "R420 of R600" over contributor names, which makes a pool-the-work-colleagues pitch look like infrastructure. Fix: M1's attribution line plus a wording rule - **the figure is a promise, never a held amount** ("people in this group have said") → test `tests/screens/friend-ledger.test.tsx` asserts promise wording on a proxy circle and that nothing reads as custody ("held", "escrow", "balance"). Stripe-Connect readiness is untouched: the seam RN-A names (nullable `ledger_events.actor_user_id`, `prisma/schema.prisma:368`) needs nothing, and `users.plan` / `entitlements.source = 'subscription'` stay the only hooks.

## 4. Spoofing and notification spam

**Verified in code, not inherited:** no outbound send path exists in `src/`. `src/server/wa/` is a bounded GET helper (`http.ts:29`), media download by id (`media.ts:14`), inbound webhook parsing and a pg-boss queue, and every `method: 'POST'` in `src/` is a model call (`models/client.ts:40,63`); deviations `:40` records the same. So nothing today can message a number a stranger supplied, and RN-B must not change that - lookup and create are forbidden from importing any send helper, and no response leaves the app, so both "the reveal is a human act" and `X-Robots-Tag: noindex` (`circle.ts:47`) survive untouched → test `tests/routes/lookup.test.ts` "a lookup and a proxy create touch no send path", as a static import check plus a fetch spy. The cost attack arrives only with RN-F and it is real: an OTP to an unverified number is an **always-charged authentication template** (`AGENTS.md:42`), so scripting victim numbers at it drains our account, harasses people who asked for nothing, and drags the **quality rating of the whole business account** down, throttling messaging for every legitimate user including the demo. Gate on RN-F: OTP send reachable only from a session that already passed the gate, never from a lookup or create, own bucket.

## 5. The throttle: verified unmounted, and where it must go

Confirmed by grep, not by the ledger: `checkGateThrottle` is defined at `throttle.ts:10` and its **only importer in the repo is `tests/routes/throttle.test.ts`** (`:6,16,27,36`) - no file in `src/` imports it, as `ARCHITECTURE.md:154` and deviations `:73-74` already say. M-02 (`security_best_practices_report.md:153-165`) is still open and its cited lines (`circle.ts:186-193`) have drifted: the probe is now `:416-419`. **Where:** the top of the gate branch in `circlePost` (`:397`), before `readForm` (`:400`) and before the probe, so it precedes any DB read; the same guard as the first statement of the lookup route and of proxy create. Session-scoped subpaths (`:296-395`) stay unthrottled - they have an authenticated principal and RLS says no. **Limit:** keep 5 per 60 s (`throttle.ts:1-2`), right for a human mistyping; deny with a uniform body plus `Retry-After`, never echoing identity or membership (`oracle-vm.md:89`, binding on RN-B). **Key:** trusted address + keyed phone hash (`throttle.ts:7-8`), never raw input - `:11` throws above 256 code units so a long number cannot inflate the key.

Two things nobody has written down, both load-bearing. (a) **The trusted address does not exist in code:** no `src/middleware.ts` and no `x-forwarded-for` anywhere in `src/`. Caddy overwrites `X-Forwarded-For {remote_host}` and strips `Forwarded`/`X-Real-IP` (`Caddyfile.example:20-25`) and the app publishes no port (`oracle-vm.md:12`), so the socket peer is always Caddy's address - **keying on the socket collapses every real user into one 5-per-minute bucket**, a self-inflicted outage, while trusting a client header lets one attacker fill the key space with a `curl` loop. `oracle-vm.md:91` names this contract as still owed, and RN-B owes it: one helper `trustedClientAddress(request)` reading `X-Forwarded-For` **only** under a `TRUSTED_PROXY` flag, else the socket, with the local demo unthrottled-by-flag rather than broken → test "the throttle key comes from the trusted proxy contract, not a client claim": a forged `X-Forwarded-For` buys no 6th attempt. (b) **Fail-closed saturation is a DoS amplifier:** `throttle.ts:18-27` denies *all new keys* once 4096 live buckets exist, for up to 60 s - deliberate and tested (`throttle.test.ts:16-23`), but mounted on a public unauthenticated route, 4096 cheap requests lock out every legitimate visitor, and the map is in-process, one container, cleared by restart (`throttle.ts:6`, `oracle-vm.md:45`). So **per-creator caps belong in the database, not the map:** a create counts rows with `proxy_created_by_user_id` = actor inside 24 h and refuses past **10** → test "an 11th proxy circle in a day is refused, byte-identical to a 12th".

## 6. Pepper separation - answering RN-A's open question

One secret does two jobs: `env.SESSION_SECRET` signs the bearer cookie (`session.ts:49`; payload `{u,c,r,e}`, 14-day TTL `:23`, `:52-62`) *and* is the phone pepper (`circle.ts:412-413`). **A dump leaks no pepper either way** - it lives in env, not a table - so `allowlist_entries.phone_e164_hash` (`schema.prisma:221`, unique per circle `:229`) and RN-A's `recipient_phone_e164_hash` are only digests on their own. What sharing changes is the **blast radius of the env file**: one leaked `SESSION_SECRET` both mints forged owner sessions for any user and circle *and* hands over the key to crack dumped hashes offline across a ~10^8 SA space. Splitting them makes an auth failure an auth failure and a privacy failure a privacy failure, each recoverable alone.

**M6: two secrets, not three** - add `PHONE_HASH_PEPPER` (min 32 chars like `env.ts:13-16`, boot-checked set and `!== SESSION_SECRET`) and point **every** `hashPhone` caller at it in one change: gate (`circle.ts:413`), lookup, proxy create, seed, `circle-link.test.ts:202`. Do **not** mint a per-purpose phone pepper: if the allowlist and the proxy row key the same number differently, RN-A `D4` claim conversion breaks, since a recipient gate pass (`:416-419`) must still match `recipient_phone_e164_hash`. Rejected: a slow KDF instead of HMAC - equality lookup needs a deterministic digest with no per-row salt, so a KDF breaks the join at `002_policies.sql:344-349` and buys nothing while the pepper sits in the same env file. Keep RN-A's framing as the accepted limit: this defends a *table*, not a targeted offline crack → test: boot rejects a missing or equal pepper, and an existing-contract test that a gate-passing number still matches its proxy row under the new one.

## 7. Threat table

| Threat | Actor | Surface | Mitigation | Residual risk |
|---|---|---|---|---|
| Bulk harvest of registered numbers | scripted stranger | lookup route | §8 narrowing (consent-only findability) + 5/60 s per trusted address | targeted single-number check, unmitigated and unmitigable |
| Existence by status code | stalker | `/c/<slug>` 404 vs 200, `circle.ts:172,174` | M-no-slug: a lookup body never contains a slug | slug entropy still unimplemented; only `seed.ts:41`, a word slug |
| Existence by timing | attacker, ~200 samples | found branch runs the friend projection | deleting the found branch deletes the channel | if RN-B keeps found, both branches need padding |
| Existence by body size | attacker, 1 request | two distinct HTML bodies | one body; shell already byte-identical (`:74-77`) | none, under the narrowing |
| Existence by error string | attacker | notices at `:404,409` + 503 at `:453-455` | one notice string; lookup throws fold into the 200 body | a crash outside the route still surfaces as 503 |
| Namespace squat / fabricated drive | any gated user | proxy create, free-text `occasion`, `recipient_label` | M1 attribution, M2 gated creator, DB cap of 10/creator/24 h | attribution is not attestation; no dispute or takedown path |
| Money-credibility fraud | gifter in a real WhatsApp group | a `settledMinor` total on a proxy circle | M3 promise wording, never custody | our render stays a convincing prop; we hold nothing so we steal nothing |
| OTP cost attack + victim spam | attacker | a future RN-F send path | nothing reachable today; RN-F behind an existing session, own bucket | a downgraded template rating throttles the whole account |
| Throttle-key spoofing | attacker | a client-supplied `X-Forwarded-For` | `trustedClientAddress` behind an explicit proxy flag | local demo has no proxy, so the limiter is untestable where the video is recorded |
| Throttle saturation lockout | attacker, 4096 keys | `throttle.ts:18-27` fail-closed | accepted; the DB per-creator cap is the durable limit | all new keys denied up to 60 s; single instance, reset by restart |
| Leaked-table de-anonymisation | stolen DB backup | both phone hash columns | M6 separate `PHONE_HASH_PEPPER` | ~10^8 keyspace; a pepper in the same env file is offline-crackable by design |

## 8. Cost against the window, and the narrowing

Eight days remain (`rn-tracks.md:30-38`). **Ship:** M1 (one join), M2 (reuses the gate), M3 wording, M6 pepper split (mechanical, ~30 min), M-no-slug (an assertion), the throttle mount plus `trustedClientAddress`. **Do not ship; name to judges as a known limitation:** a durable shared limiter, an OTP door, a dispute/takedown path, multi-instance throttling.

**G1, and why the narrowing belongs in this file rather than RN-B:** the *found* branch is the oracle, the *proxy create* branch is the product. Deviations row 2 records no visibility field on `Circle` or `User`, and item 1 records `registry_profiles` as unbuilt - so there is no consent to key findability on, and "search → see their registry" reveals the circles of people who never opted in, which §1 shows no throttle makes safe for a targeted check. **Recommendation: inside the submission window RN-B is a create-only route.** It takes a number and always offers a proxy registry; it never renders an existing circle. The novel, demoable half survives and the oracle is deleted rather than taxed, which gives the video a stronger line than any limiter: "our own threat model found phone lookup was an existence oracle, so we shipped the half that helps gifters and removed the half that outs them." Findability returns with `registry_profiles` plus a visibility field - post-submission, by `rn-tracks.md:38`'s own logic.

## Success criteria

1. No lookup response contains a `shareSlug` substring or a `/c/` href - route test.
2. The gate POST throttles before `circle.ts:416`, counts successes and failures alike, and a 6th attempt from one address returns a uniform body plus `Retry-After`.
3. `pnpm leak` proves M1 renders and M3 wording holds on a proxy circle.
4. A forged `X-Forwarded-For` buys no extra attempts, and the socket fallback is exercised.
5. An 11th proxy create per creator per 24 h is refused byte-identically to a 12th.
6. Boot rejects a missing or equal `PHONE_HASH_PEPPER`; an allowlisted number still passes its gate under it.
7. No import path from a lookup or create handler to any send helper.
8. Nothing new reads `users.phone_e164` through an app role (`001_roles.sql:50-63`); `pnpm test`, `typecheck`, `build` and `leak` green with no assertion weakened, and `/c/nadia-30th` still resolves.

## Out of scope

The lookup route and its response bodies (RN-B). Create UI and form (RN-C). Archive and expiry (RN-E). OTP template approval and the send path itself (RN-F). Bot tasks (RN-G). Lifting `noindex` (RN-H). Legal takedown process. Abuse monitoring or an admin console.

## Open questions

- Who answers G1? **ANSWERED 2026-10-27 (owner, Wave 0): create-only.** RN-B takes a number and
  always offers a proxy registry; it never renders an existing circle inside the submission
  window. The found branch returns post-submission with `registry_profiles` plus a visibility
  field. See `rn-i` §Decision.
- Is M1 enough for someone being impersonated, given they can never learn the circle exists? A notification-free dispute path needs an owner inbox that does not exist. *(Still open; post-submission, see handover §7 decline list.)*
- Should `TRUSTED_PROXY` default on or off? **ANSWERED 2026-10-27 (owner): default OFF.** The
  localhost demo is unthrottled-by-flag; the VM enables it explicitly behind Caddy.
- Does a per-recipient cap need a non-unique index on `recipient_phone_e164_hash`, or is per-creator sufficient? *(Still open; per-creator DB cap of 10/24h is the shipped gate — Gate 4.)*

## Closure (2026-10-27)

G1 and the `TRUSTED_PROXY` default are answered above, so this file is `status: ready`. Gates
2–7 below remain RN-B/RN-C implementation gates, not open questions: they must be true before
RN-B ships, and each names its test. Pepper separation (M6) is decided in §6: split
`PHONE_HASH_PEPPER` from `SESSION_SECRET`, one secret per failure domain.

## Gates (what must be true before RN-B ships)

1. `status: ready` on this file; RN-B is externally gated on it (`rn-tracks.md:34`).
2. G1 answered. If the found branch stays, RN-B must additionally prove M-no-slug, a padded single body and one notice string, and this file re-records the oracle as **accepted**, not mitigated.
3. `trustedClientAddress` exists behind the proxy flag and the throttle runs ahead of every unauthenticated DB read; M-02 is not marked closed on the helper alone (`oracle-vm.md:89`).
4. The per-creator create cap is enforced from the database, not the in-process map.
5. `PHONE_HASH_PEPPER` split with a boot check, every `hashPhone` caller migrated in one change.
6. A CSPRNG `shareSlug` generator, >= 16 chars (`security_best_practices_report.md:289-290`), exists before any route mints a slug; until then proxy circles are seeded, never user-created.
7. No import of a send helper reachable from a lookup or create handler.
