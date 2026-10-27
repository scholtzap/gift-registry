# Piñata accessibility review and human first-click script

Reviewed 2026-10-27, during parent integration. This is a bounded review against relevant WCAG 2.2 A/AA criteria, not a conformance assessment. No human participants, assistive-technology sessions, axe scan, completion rates or compliance claims are represented here.

## Scope, method and evidence

Read both installed skills:
- `C:/Users/apsch/.claude/skills/accessibility-audit/SKILL.md`, plus `references/wcag-audit-checklist.md`, `mobile-accessibility.md`, `axe-audit-playbook.md` and `screen-reader-testing.md`.
- `C:/Users/apsch/.claude/skills/click-test-plan/SKILL.md`.

Reviewed the complete shared UI, all eight screen files and standalone CSS:
- `C:/Users/apsch/Documents/personal/gifts-registry/src/components/ui.tsx`
- `C:/Users/apsch/Documents/personal/gifts-registry/src/components/screens/{landing,join,owner-ledger,friend-ledger,item-detail,draft-confirm,card-composer,settings}.tsx`
- `C:/Users/apsch/Documents/personal/gifts-registry/public/pinata.css`

Also inspected the page layout, circle adapters, current card preview script and existing fictional seed definitions to establish real destinations and realistic task states. Source changed during review: the final card source uses native uncontrolled fields and `/card-preview.js`, not the earlier non-hydrating React event handlers. Card GET/save/render paths were also present in the later route snapshot. Those changes are **statically reviewed, browser-unverified**.

Browser evidence: installed Playwright 1.64.1, headless Chromium 156.0.8078.4, isolated context without login, at `http://127.0.0.1:3000/`. Browser run began `2026-10-26T22:20:04Z` (27 October locally). Navigation and requests were GET-only; no DB seeding, policy application, authentication setup, package install or test suite run. External requests were blocked in the main probe. No product source, tests, configuration or Git state was edited.

All probes, JSON and screenshots are outside the repository:
`C:/Users/apsch/AppData/Local/Temp/qoder-gifts-registry/session-503255f9-accessibility/`.

Evidence files: `landing-probe.cjs`, `landing-results.json`, `landing-{320,390,1024}.png`, their `-skip-focus.png` variants, and `landing-390-{text-200,text-spacing,forced-colors}.png`. Screenshots were visually inspected. The Next.js development badge is visible in captures and is not part of Piñata; it also adds a developer focus stop. Do not use these captures as polished participant stimuli without disclosing/removing developer chrome in a later authorized capture.

`axe-core`, `@axe-core/playwright` and `@axe-core/cli` were not resolvable from installed dependencies. No automated accessibility scanner was installed or run. Playwright's ARIA snapshot verified browser-computed names/structure, not screen-reader speech.

## Verified public landing results

| Check | Result and boundary |
|---|---|
| Reflow at 320 / 390 / 1024 CSS px, height 844 | HTTP 200 at each width; document/client width exactly matched viewport; no product element crossed horizontal bounds. Mobile stacked, desktop two-column. Text and actions remained visible in full-page captures. |
| Keyboard and skip link | Product order: Skip to content → Piñata home → Open Piñata → How it works. Shift+Tab returned to the preceding product link. Skip link became visible on first Tab; Enter focused `main#pn-content`; next Tab reached Open Piñata, bypassing the header. |
| Focus | Tested links had a 3px blue outline with 4px offset. Skip and action focus were visible and not fully obscured. Main's outline extends beyond viewport sides because main is full-width; the working focused skip destination is not a trap. |
| Names and semantics | ARIA snapshot exposed all four named links; one H1; H2/H3 section hierarchy; main, banner, contentinfo, named Example complementary region and named story region. Brand image has empty alt inside the named home link. |
| Text contrast | No measured landing text pair fell below its applicable AA threshold. Lowest normal-text ratio: tertiary ink `#0e7490` on blue wash `#e3eeff`, **4.577:1**. CTA white on pink `#e11d63`: **4.608:1**. Solid computed foreground/background calculation, not an axe result. |
| Reduced motion | Emulated preference matched; product computed animations/transitions were absent and scrolling was `auto`. No animated landing content was observed. This does not test future/private animations. |
| Text enlargement and spacing | At 390px, setting root font size to 200% caused no horizontal overflow or visible loss. A separate injected spacing check used line-height 1.5, paragraph margin 2em, letter spacing .12em and word spacing .16em; no overflow/loss observed. This is **not actual browser 200% zoom**. 320px geometry was checked, not an actual desktop 400% zoom session. |
| Forced colors | Chromium emulation preserved readable text, underlined links, CTA border and highlighted focus in the inspected capture. Not an OS high-contrast or AT session. |
| Touch geometry | Brand 44px high; primary CTA 48px high (288px / 358px wide on mobile). How it works: 23px high at all widths, full-width on mobile and about 86.5px wide at 1024px. No physical-device touch session was run. |
| Primary navigation | Clicking Open Piñata reached `/app`, HTTP **404**, “This page could not be found.” This blocks the primary journey despite clear visual affordance. |
| Runtime | No page errors or failed requests in the main public probe. Not evidence about private screens or production. |

Shared token calculations also support the static review: muted ink on pink/blue wash 5.726:1; input border on white 3.900:1 and on washes 3.332:1; focus/link ink on washes 5.453:1; secondary text on white 4.770:1. Accent secondary on washes is about 4.075:1: appropriate for the current 24px price text, **not** arbitrary small text. Pink/blue/warning badges have white backgrounds, so the washed-background accent ratios must not be reported as existing badge failures. Disabled controls are not assessed against active-control contrast requirements.

## Findings and targeted remediation

Severity vocabulary: Critical = blocks access entirely; Major = significant difficulty; Minor = workaround available; Enhancement = robustness beyond an established failure. Findings below distinguish source evidence from browser evidence. WCAG references identify relevant checks, not certified violations.

### 1. Major — landing primary action reaches a missing destination

**Verified in browser.** Location: `src/components/screens/landing.tsx:22`, `href="/app"`; no `/app` adapter appeared in the reviewed app routes.

Impact: every new visitor following the dominant action hits a dead end. This is a functional/findability blocker for all users, not a demonstrated specific WCAG failure.

Minimal remediation: connect the CTA to a real, public, privacy-safe entry flow or accurately explain the invite-only entry path. Do not hard-code a private demo-circle/card URL as a shortcut. Retest the actual first click, resulting response and keyboard recovery. Existing `/c/<slug>` URLs must remain stable.

### 2. Major readiness blocker — draft/item mutations were not connected in the inspected route snapshot

**Static, browser-unverified.** `src/server/routes/circle.ts`, `handleCirclePost`: the later snapshot handled card actions and settings; other private paths fell through to `notFound()`. Draft/item GET adapters existed, but that does not verify their POSTs. Draft confirmation and item claim/pool/payment/purchase forms point to those private POST paths.

Impact: finding the correct control is not evidence that recording an item or purchase works. Do not report live click-path completion from these screens until the parent finishes integration.

Remediation: parent wires the existing mutation handlers and their recoverable error responses, then exercises the already-authorized demo state. No endpoint, DB or policy changes were made in this review. This is an integration finding, not an asserted WCAG violation; error handling should be retested against 3.3.1/3.3.3.

### 3. Major fallback gap / Minor instruction ambiguity — anonymous card entry still depends on script for conditional required state

**Static, browser-unverified.** `card-composer.tsx`, Field `required={!anonymous}` and Anonymous checkbox; `public/card-preview.js:8` changes `name.required` on input/change. Shared Field prints “(required)” according to its initial prop.

On a new/non-anonymous entry, disable or fail the preview script, leave the name blank, enter a message, then select Anonymous. Native name validation still blocks submission. With the script working, the input requirement changes but the rendered “(required)” label does not change until a new server render. Initial anonymous entries have the converse visual-label problem when anonymity is unchecked.

Impact: the claimed native fallback cannot save this anonymous flow without supplying a name; contradictory instructions burden users relying on labels or magnification. Related checks: 3.3.2 Labels or Instructions, 4.1.2 Name/Role/Value. JavaScript being disabled alone is not a WCAG failure.

Minimal remediation: allow the native field to remain optional and enforce “name required unless anonymous” on the server, with a permanently accurate visible instruction. Preview script can remain optional. Retest new/existing entry, both toggle directions, script enabled/disabled, label/required announcement and saved anonymity. Never reveal another contributor's draft.

### 4. Minor — validation recovery is generic and can discard unsaved card text

**Static, browser-unverified.** Shared `Field` associates hints but has no field-error/invalid props. Join renders a generic alert; draft/card/settings notices use `role="status"`. The inspected card save catch returns the previously loaded `card` with a generic validation notice, not the submitted message.

Reproduction to perform later: write a new message containing a URL, submit, and check whether the rejected unsaved message survives and the correction is reachable. Related checks: 3.3.1, 3.3.3 and, for dynamically inserted feedback, 4.1.3. `role="status"` in a freshly loaded document does **not** prove an announcement; full-page navigation is different from a live update. No speech behavior was tested.

Minimal remediation: preserve the actor's own submitted text on validation failure; identify the offending field with linked error text and `aria-invalid`; provide deliberate focus/error-summary recovery. Keep join authorization denials generic so errors cannot enumerate invitations. Do not turn successful full-page redirects into alleged live-region failures without an AT check.

### 5. Enhancement — small standalone link hit areas

**Landing measured; private links static.** `.pn-link` has no minimum hit height. Landing How it works measures 23px; settings/navigation/card links use the same style. Buttons, back links and checkbox labels have larger minimums.

Related check: 2.5.8 Target Size (Minimum). A 23px link is **not automatically an AA failure**: spacing and inline exceptions must be evaluated. The measured landing link has 12px separation from its neighboring CTA, supporting the spacing exception. This review does not declare a target-size violation.

Minimal improvement: give standalone navigation/action links a 44px hit height without enlarging prose links. Retest wrapping and neighboring targets at 320px, and on physical mobile devices. Checkbox input is 20px but its wrapping label supplies the larger target.

### 6. Minor usability — account settings label and return paths

**Static, browser-unverified.** Owner/friend links say “Circle settings”; the destination correctly says choices are private and apply to the account. Settings and card composer lack an explicit circle/item back link; the shared home link returns to the public page whose primary route currently 404s.

Impact: people may expect to change everyone's AI choices or struggle to get back after editing. No specific WCAG failure is asserted; 2.4.6 is relevant to label clarity.

Minimal remediation: label account settings consistently and add explicit contextual return links using the existing `Screen` back-link props. Retest without relying on browser history.

## Complete static screen coverage

All seven non-landing screens below are **browser-unverified**, including the public join gate, which needs a known valid circle. No private payloads, cookies or signed sessions were fabricated.

| Screen | Existing strengths | Remaining browser checks |
|---|---|---|
| Landing | Working skip/focus, semantic hierarchy, named links, real fonts, reflow/contrast verified above. Illustration is explicitly fictional. | Fix primary destination; actual zoom and mobile/AT coverage. |
| Join | Explicit name/tel labels, required indicators, correct autocomplete and inputMode, international-format hint, generic gate notice, native submit. Parent's Field autocomplete fix is present. | Native validation; denied/format-error focus and recovery; clear explanation that this gate does not verify number possession. |
| Owner ledger | Owner-scoped presentation, title-linked wishes, textual confirmation badges, headings/lists/preferences, stable circle share link. No claim/pool display. | Long circle/item titles at 320px, empty/populated states, share/settings/draft destinations and owner-safe item detail. |
| Friend ledger | Explicit friend-only warning, named actions nav, textual item/pool status, tombstone explanation, unique “View [title]” links. No reliance on color alone. | Dense/long-item reflow, actual link hit areas, funded/pivot/tombstone states. Item title itself is not a link: record misclicks there rather than accepting the whole card. |
| Item detail | Named native forms/buttons, cents labels/hints, positive minimums, textual pool totals/status; buyer purchase control is conditional; tombstones retain contribution explanation. | All POST outcomes; claim/open/funded/buyer/non-buyer/pivot/revealed states; money-entry mistakes; card eligibility. Own contribution/payment status is explicitly unavailable, so do not task-test information the projection lacks. |
| Draft confirmation | Manual and draft paths clearly distinguished, editable labeled fields, optional price, explicit human confirmation, non-ZAR explanation plus disabled confirm, friend-only copy. | Confirm POST; retained edits on error; unknown/zero price, long names and non-ZAR disabled state; no assumption that WhatsApp intake is configured. |
| Card composer | Named textarea and checkbox, help associations, contributor messages remain text, native fields now replace hooks, named preview, explicit generate/download controls, human-only handover copy. | Optional-script anonymity issue; saved/unsaved distinction; validation recovery; eligible giver versus owner/non-giver; PNG download and textual equivalent. Preview need not announce every keystroke. |
| Settings | Per-account explanation, uniquely named Enable/Disable controls, labeled/described forms, textual On/Off state, explicit manual fallback and unavailable-versus-off distinction. | Toggle/reload state and focus, label vocabulary, no-model-call behavior after disabling (not inferable from UI), failure state. |

Shared layout review found one main/skip target per screen, native controls rather than custom widgets, no positive tabindex, no modal/focus trap, wrapping grids/actions, resizable textareas, preserved outlines, reduced-motion and forced-colors CSS. These are source strengths, **not** blanket private-screen test passes. Private raw HTML has language, viewport and page titles in its shell; current draft title is generically “Review your draft” even in manual mode.

## Runnable human first-click script

### Objective and setup

Question: can invited gift recipients and gift-givers locate the next action without instructions naming the interface control?

Use real consenting adults familiar with group gift planning; include gift recipients and organizers, and recruit participants who use their own accessibility settings/devices. No participants have been recruited or simulated. Start with qualitative observation; do not publish percentages from a small convenience sample. Any later quantitative recruitment/sample size is a separate decision.

Use only the existing fictional cast and an authorized, already-provisioned demo circle (`/c/nadia-30th` if available). The seed's BSUID-only identities are **not working phone-gate credentials**; its allowlist hashes BSUIDs rather than real E.164 numbers. Do not invent a login number, forge sessions, seed another database or change policies to make this script run. Parent must supply existing authorized role sessions/stimuli; otherwise record that screen/state as unavailable. Keep any recordings outside the public repo, anonymize participant identifiers, and never capture real phone numbers or private gift conversations.

For first-click trials prefer frozen captures at native scale with scrolling, not a full-page image shrunk to fit the viewport. Display at 390×844 initially; evaluate 320px separately, and keep desktop trials at 1024px separate. Start at the top for every task, permit scrolling, and log it. Define the target bounds from the exact stimulus before the participant sees it. Do not average results across viewport/state variants. Use one task per screen per participant, not repeated practice on the same screen.

First-click recording must not send a POST. On screenshots, record the chosen coordinates; do not navigate or submit. A later live click-path follow-up needs parent-authorized disposable demo state and is separate from this non-mutating study. Keyboard/AT observation uses live authorized pages as a separate modality, not mouse-coordinate scoring.

### Facilitator introduction — read verbatim

“We're testing the page, not you. I'll describe a situation. Choose the first place you'd go to do it. You can scroll. There may be more than one sensible place. I won't explain the page while you're choosing. You can stop at any time.”

For each row: show the starting screen/state, read only the participant prompt, start timing when both are available, record the first selection, freeze the trial, then ask: “How confident are you, from 1, not confident, to 5, very confident?” After recording, ask: “What did you expect would happen?” Do not provide hints or reveal the accepted target before recording. Capture abandonment explicitly; never guess a click or time.

### Eight independent task cards

The target column is facilitator-only. Targets are the actual field/link/button/label hit regions, not surrounding decorative panels.

| Screen and required starting state | Participant prompt | Predefined accepted first target | Readiness / optional later path |
|---|---|---|---|
| Landing `/`, top | “You want to start planning a group gift. Where would you go first?” | Open Piñata link. | Findability can be observed now; destination is verified 404. Do not classify a correct first click as completed setup. |
| Join `/c/<slug>`, logged out, blank form | “You've opened an invitation to Nadia's birthday gift group and want to take part. Where would you begin?” | Either Your name or WhatsApp number input, including its associated label. Both begin required identity entry. | Valid-circle capture needed. Continue with blank fields is not accepted. A later gate submission requires legitimate credentials supplied separately; no phone goes into the research log. |
| Owner ledger, Nadia, populated wishes | “You have one more gift idea you'd like your friends to consider for your birthday. Where would you begin adding it?” | Add a wish, or Review a draft: both currently point to the same draft path. Log which one separately. | Existing owner session needed; next page must be editable manual/draft entry, not a friend ledger. |
| Friend ledger, existing funded burr grinder visible | “You want to see how the group is arranging the burr grinder. Where would you go first?” | View burr grinder link only. | Existing friend session needed. Clicking plain title, amount or pool badge is a diagnostic misclick, not accepted whole-card selection. |
| Item detail, Thabo as assigned buyer, active funded burr grinder | “You've bought the burr grinder and want the group's record to reflect that. Where would you go first?” | I bought this gift button. | Existing funded-buyer state required; freeze before POST. Purchase mutation was not integrated in the inspected snapshot. Do not substitute a non-buyer state and score the absent action. |
| Draft confirmation, valid ZAR values already populated/reviewed | “These gift details are now correct. Where would you go to put this item on the wish list?” | Confirm and add item button. | Existing draft or manually populated, unsaved form capture; no DB write needed for capture. Freeze before POST; mutation integration remains to verify. |
| Card composer, eligible gift-giver, initially non-anonymous entry | “You want your message to appear on the gift card without identifying you. Where would you go first?” | Show me as Anonymous checkbox or its associated label. | Existing eligible-giver state required. Later check save + reload/PNG, but first click only establishes findability. Include script-disabled follow-up for the documented fallback gap. |
| Settings, voice transcription currently On | “You want AI to stop processing voice notes for your account. Where would you go first?” | Disable voice transcribe button, using the current adapter's label. | Existing enabled state required. Later reload must show Off; proving spending stops needs separate authorized capability-path verification. Do not test a disabled initial state with this prompt. |

Record one row per actual trial: anonymous participant ID; role experience; screen/state; viewport; input modality; first clicked element/coordinates; accepted target yes/no; time to first selection; confidence 1–5; scroll/hesitation; expected outcome; unavailable state or technical blocker. Keep **first-click correctness**, **destination working** and **eventual completion** separate. No results exist yet. Inspect misclick clusters before proposing wording changes; do not treat a generic 65% benchmark as a launch/compliance threshold.

## Follow-up accessibility session matrix — not run

| Modality | Human actions and observations |
|---|---|
| Keyboard only, Chromium/Firefox | Tab/Shift+Tab from top; activate skip with Enter; operate inputs/Anonymous; test buttons with Enter/Space; inspect focus after validation/navigation and return links. Check no focus is hidden by mobile keyboard/sticky UI. |
| NVDA + Firefox | Browse mode: `D`, `H`, NVDA+F7 for landmarks/headings/links. Forms mode: hear labels, required state and hints; invalid submit, correction, anonymous toggle, successful save/toggle and reload. Verify what is actually spoken, not just DOM roles. |
| VoiceOver + Safari, macOS/iOS | Rotor headings/links/forms; read and activate labels; test touch exploration and anonymous state; navigate errors and textual contributor messages; inspect downloaded-card alternative. |
| TalkBack + Chrome, Android | Swipe/explore to controls; native number/tel entry; checkbox and submit; text enlargement and real tap targets. Include WhatsApp in-app-browser entry separately. |
| Low vision / motion | Actual browser 200% zoom; 1280px desktop at 400% zoom (320px effective layout); text-spacing settings; OS forced/high contrast; reduced motion. Repeat private empty/populated/error/long-content states. |

Do not ask people to discover nonexistent actions: draft has no browser voice-upload control; item detail does not show personal payment status; the system never sends a card; settings are account-private. Owner routes must not expose friend coordination or cards in headings, names, error messages, browser title, previews or screenshots.

## Handoff acceptance gates

1. Fix the public primary destination and rerun its keyboard/click journey; this is the quickest public blocker to confirm.
2. Finish draft/item mutations and the anonymous native fallback, then validate existing authorized role screens and recoverable errors. GET presence alone is insufficient.
3. Supply private, fictional, correctly scoped stimuli; run the eight human task cards without writes and record actual observations.
4. Run real zoom/mobile and NVDA/VoiceOver sessions; obtain an approved scanner baseline later if available. Until then, private browser behavior, AT speech, authenticated contrast/reflow, mutation success and human findability remain unverified.

Only this report was written inside the repository. It is deliberately uncommitted: this review explicitly prohibits Git changes and the parent owns integration/commit.

## Parent browser verification addendum — 2026-10-27

The original review records its snapshot; this addendum records later repairs rather than replacing its evidence. The landing first click now reaches a real public `/app` invite entry. Item/draft/settings/card adapters are mounted and enforce canonical-origin native POSTs. Card names remain natively optional with server enforcement unless Anonymous; anonymous save works when the optional preview script is unavailable. Rejected actor-owned draft/card edits are retained for correction. Card/settings contextual return links are present. Shared Field IDs are explicit and unique, with matching labels; a repeated-name regression failed before that repair.

Ten actual Chromium flows passed on both dev and production; the final production rerun also passed after the intake consent/pool fixes. Coverage includes private draft confirmation, claim/release/pool/contribution/paid persistence, settings/reload, literal card preview/save/PNG, no-JS anonymity, generic logged-out responses and owner/forged-friend exclusion. Owner navigation was checked at 320/390/1024 px; the 390px screenshot was visually inspected without horizontal overflow. Browser harness checks page errors; database tests separately verify consent refusal. The final integrated suite has 393 passing Vitest cases plus typecheck/build.

This is not a full private-screen WCAG or usability assessment. Generic error summaries/field-level recovery, vocabulary such as Circle settings, physical-device/WhatsApp-browser behavior, long/empty/error variants, actual zoom, AT speech and human first-click observations remain open. No axe tool, human participant, NVDA/VoiceOver/TalkBack session or compliance result was added. The eight task cards remain a facilitator script with no results; purchase tasks must not be treated as live-complete while the multi-user purchase transition remains unsupported.
