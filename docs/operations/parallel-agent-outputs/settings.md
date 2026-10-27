# Settings screen output

## Owned changes

- `src/components/screens/settings.tsx`: exported `CapabilitySetting` and `SettingsScreen({ settings, basePath, notice? })`.
- `tests/screens/settings.test.tsx`: 10 public ReactDOMServer + Vitest tests, without shared UI mocks or React internals.
- This output record. No routes, shared UI, CSS, services, packages, configuration, secrets or git state changed.

Read `DESIGN.md`, architecture sections 1–3, SPEC F12, `src/server/entitlements.ts`, and the requested frontend-design and accessibility-audit skills.

## Rendering and payload

The screen renders only the parent's supplied capability rows, labels, descriptions and boolean states. It imports presentation primitives, not server entitlements or plan defaults. Empty input stays empty; an optional escaped status notice does not override any state. There is no plan, billing, payment or invented unavailable-as-off state.

Each row has a native POST form targeting exactly `${basePath}/settings` with three hidden inputs:

| Input | Value |
|---|---|
| `capability` | The supplied capability string |
| `enabled` | `String(!setting.enabled)` |
| `intent` | `toggle` |

For enabled `voice_transcribe`, the payload is `capability=voice_transcribe&enabled=false&intent=toggle`; for disabled `card_art`, it is `capability=card_art&enabled=true&intent=toggle`. No user or circle identity is submitted. State updates are server round-trips, not optimistic client changes.

Visible On/Off text accompanies a specifically named Disable/Enable button. Each form is named by its capability heading and described by its visible state and fallback description, with unique React-generated IDs. Consent copy describes permission for the actor's own actions, manual gift entry and plain cards; unavailability is explicitly not a consent change. The component uses shared Screen, Panel, Button and Badge contracts and semantic `pn-*` classes; native hidden inputs need no Field wrapper. V7 styling remains shared, with no local palette, cursive, shadow or CSS overrides.

## Actual validation

1. **Initial red:** tests written before the screen; Vitest exited 1 with one failed suite, zero executed tests, because the screen import did not exist.
2. **Initial green:** minimum implementation rendered through real shared UI; 8/8 tests passed.
3. **Accessibility red:** added association and escaping tests; 9 passed, 1 failed because `aria-describedby` was absent on the native form. The current shared Button contract does not forward arbitrary ARIA props. Moved the association onto the form rather than changing shared UI.
4. **Inverse-payload sensitivity red:** temporarily changed the hidden `enabled` value to the current state, not its inverse. Exactly 4 tests failed and 6 passed, including the enabled row reporting expected `false`, received `true`, and the disabled row reporting expected `true`, received `false`. Restored the correct inverse immediately.
5. **Final green:** 10/10 tests passed, Vitest 5.0.5, exit 0. Coverage includes both inverse payloads, private base-path targeting, labels/descriptions, accessible associations, escaping, consent/fallback copy, empty input and unavailability notices.
6. **Owned TypeScript check:** screen, tests and their imported dependencies passed with strict repository compiler options and `noEmit`, `incremental: false`.
7. **Full workspace TypeScript check:** failed at the time of the run in other agents' `card-composer.tsx`, `item-detail.tsx` and `landing.tsx`, with Field/Button contract errors and a missing Button import. No settings diagnostics; those files were left untouched.

The screen suite ran through Vitest's public API with in-memory options, avoiding the repository config's database setup and `.ts`-only include. No environment file was loaded by this runner, and no config file was created or changed:

```js
import { resolve } from 'node:path';
import { startVitest } from 'vitest/node';
const ctx = await startVitest(
  ['tests/screens/settings.test.tsx'],
  { run: true, config: false, environment: 'node' },
  {
    resolve: { alias: { '@': resolve(process.cwd(), 'src') } },
    test: { include: ['tests/screens/settings.test.tsx'], globalSetup: [], cache: false },
  },
);
await ctx.close();
```

## Integration boundaries and gaps

- No route currently imports this screen. The parent must mount it on an authenticated private account route, never an owner/friend circle projection, and pass only the signed-in actor's successfully resolved gate states under RLS. The component cannot enforce authentication or response caching; the route must keep this personal response private.
- `can()` fails closed to `false` on evaluation errors. The parent must distinguish unavailable evaluation from an actual disabled capability, using the existing typed error distinction rather than labelling every failed check Off. Unresolved rows must not be manufactured as disabled settings; notices can explain why no verified settings are shown.
- The parent supplies truthful per-capability descriptions, including the corresponding manual/plain fallback. It decides which real capabilities are offered; the screen does not advertise deferred features or infer entitlements from a plan.
- The POST adapter must validate the capability, `intent=toggle` and literal boolean strings, derive the actor from the authenticated session, apply existing request-origin/CSRF protection, call `setCapability` in the actor transaction, and reload authoritative state. The screen supplies the form contract only; persistence and route privacy were not tested here.
- At validation time the repository Vitest config included only `tests/**/*.test.ts` and a database global setup. Normal test discovery for this `.test.tsx` suite needs the parent's shared test-runner integration; the public API run above is the verified result, not a claim that the default package test command runs it.
- No browser, axe, keyboard, 320px/zoom or NVDA/VoiceOver audit was run. SSR proves native labels, text states, headings, descriptions and payloads; it does not prove rendered contrast, reflow, focus styling or downstream model/fallback behavior. Those depend on shared styling and route/service integration.

Changes intentionally remain uncommitted for the coordinating agent; git operations were outside the assigned scope.
