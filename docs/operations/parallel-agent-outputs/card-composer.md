# Card composer output

## Owned files

- `C:/Users/apsch/Documents/personal/gifts-registry/src/components/screens/card-composer.tsx`
- `C:/Users/apsch/Documents/personal/gifts-registry/tests/screens/card-composer.test.tsx`
- `C:/Users/apsch/Documents/personal/gifts-registry/docs/operations/parallel-agent-outputs/card-composer.md`

Only these files were written. No shared UI, services, routes, dependencies, configuration, secrets, or Git operations were changed.

## Delivered

- Exports the requested `CardComposerData` type and `CardComposerScreen({ card, basePath, notice? })`.
- Approved gift-giver projection only; access remains the parent route's responsibility.
- Uses the real shared `Screen`, `Panel`, `Button`, `Field`, and `Badge` components and semantic `pn-*` classes. The primary action saves your message; PNG generation is secondary.
- Saved contributors' names and messages appear as escaped plain text, preserving whitespace and punctuation, without italics or rewriting. Anonymous entries show `Anonymous`, not their supplied name.
- Own-entry form posts to `${basePath}/items/${card.itemId}/card` with `intent=save_entry`, `displayNameShown` (80-character native limit), `message` (200-character native limit), and the `anonymous` checkbox. No contributor identity or ledger fields are posted.
- Own-message preview updates before saving. The shared input-only `Field` supplies the name input; its change bubbles to the form to update the preview. The textarea and checkbox are controlled locally. Anonymous is a name opt-out, not a message opt-out.
- Separate POST form submits only `intent=render`; the download link points to the same card path plus `/png`. Copy explicitly directs the person to download/share/print manually, and says Piñata never sends the card or notifies the recipient.
- Handles null card copy, no contributors, a first entry, and escaped status notices. No money UI, owner-online-card promise, OG tags, sending controls, or model calls.

## Actual validation

1. **Test-first red:** wrote the public ReactDOMServer/Vitest tests before the component. The suite failed importing the missing composer (0 tests executed).
2. **Initial integration block:** after implementing, the suite failed importing the then-missing `@/components/ui` (0 tests executed). No shared file was created by this worker.
3. **Temporary isolation:** an in-memory, uncommitted Vite UI shim exercised the composer. Initially 7 passed / 1 failed because React reordered input attributes; made that assertion attribute-order independent, then 8 passed. The shim was never added to source or tests.
4. **Real shared-UI green:** once the shared module appeared, adapted to its actual input-only `Field` API. **8 tests passed against the real shared UI**, with no mocks or shims in that run.
5. **Repository typecheck:** `tsc --noEmit --incremental false` failed only outside owned files: `C:/Users/apsch/Documents/personal/gifts-registry/src/server/cards/render.ts:77` (`fontBuffers` option), and `C:/Users/apsch/Documents/personal/gifts-registry/tests/vision/extractor.test.ts:59-63` (`result` typed unknown). No composer/test diagnostics were reported.

The screen test run used Vitest 5's `startVitest` API with `config: false`, the single TSX test in `include`, `globalSetup: []`, the repository `@` alias, and automatic JSX. This avoids invoking the unrelated Postgres leak-suite setup and does not modify configuration. The final run passed all 8 tests in 16 ms.

Tests cover literal contributor text and escaping, anonymous name suppression, exact POST contracts and length limits, label associations and help text, empty/plain states, notices, no amounts, no delivery/OG controls, and manual PNG generation/download. Live typing and keyboard/screen-reader/browser styling were not exercised by SSR tests.

## Parent integration requirements

- Enforce approved gift-giver access and completed-gift eligibility before mounting this screen and on save/render/PNG requests. Return 404 for owner and other unauthorized actors; never infer access from the badge or submitted fields.
- Resolve `myEntry` from the authenticated contributor, permit edits only to that contributor's entry, validate 80/200-character limits and reject URLs server-side. An unchecked checkbox is absent from FormData; checked submits the native `on` value.
- Redirect after save/render with refreshed `card` data and optional `notice`. Rendering must use saved entries, not unsaved preview state. PNG GET must serve the generated file as a download and handle a not-yet-rendered file without exposing private information.
- Apply `Cache-Control: private, no-store` and robots `noindex` to every card surface, and suppress inherited OG/social metadata. Authentication and cache/metadata leak tests belong at the route boundary, not in this presentation component.
- Gate every optional model-spending render path with `can(actor, capability)` and retain the deterministic plain-card fallback; this component does not call models.
- Supply the semantic V7 light `pn-*` stylesheet. At this worker's final CSS check, `src/app/globals.css` still contained tokens but no `pn-*` rules; visual integration needs the parent-owned styles. Messages explicitly use normal font style, weight 600, and `white-space: pre-wrap`.

Changes remain uncommitted because this assignment explicitly excludes Git operations.
