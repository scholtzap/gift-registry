# Shared Piñata brand implementation

## Scope completed

Only these owned files were written:

- `C:/Users/apsch/Documents/personal/gifts-registry/src/components/ui.tsx`
- `C:/Users/apsch/Documents/personal/gifts-registry/src/app/globals.css`
- `C:/Users/apsch/Documents/personal/gifts-registry/src/app/layout.tsx`
- `C:/Users/apsch/Documents/personal/gifts-registry/public/pinata.css`
- `C:/Users/apsch/Documents/personal/gifts-registry/tests/screens/brand.test.tsx`
- `C:/Users/apsch/Documents/personal/gifts-registry/docs/operations/parallel-agent-outputs/brand.md`

`Brand`, `Screen`, `Panel`, `Button`, `Field`, and `Badge` implement the agreed props with ReactNode content. They are presentation primitives for either already-authorised projection, with no queries, entitlement decisions, generated contributor copy, or automatic actions. Buttons default to `type="button"`; fields use unique IDs, native labels and constraints, and associated hints. Screens have a keyboard skip link and a main landmark. Badge labels remain readable without their colour; purchased/warning tones also have distinct symbols.

The existing `/icon.png` mark is referenced unchanged. The wordmark is live Piñata text. Root metadata remains generic, without Open Graph content; `no-referrer` prevents outgoing links from carrying the current private URL. Card-route privacy headers and robots remain the route owners' responsibility.

`public/pinata.css` is real standalone CSS, with no Tailwind directives or external imports. It contains the DESIGN.md light-only tokens, all requested `pn-*` classes, native form/list/image styles, button-like anchors, responsive grids, visible focus, safe-area sticky styling, reduced-motion and forced-colour rules. Small blue text on washes uses deeper ink for contrast; the canonical blue remains unchanged for fills and large amounts. Only the sticky bar has a shadow.

Root loads `/pinata.css` through a stylesheet link. `globals.css` maps Tailwind theme names to that stylesheet's canonical tokens rather than duplicating values. The existing raw circle HTML already links `/pinata.css`; no route file was edited.

## Actual red and green runs

The render test was written before the shared implementation. Both runs used this exact Git Bash command from `C:/Users/apsch/Documents/personal/gifts-registry`:

```bash
ELECTRON_RUN_AS_NODE=1 "C:/Users/apsch/AppData/Local/Programs/Qoder/Qoder.exe" --input-type=module -e 'import { startVitest } from "vitest/node"; await startVitest(["tests/screens/brand.test.tsx"], { run: true, config: false, include: ["tests/screens/brand.test.tsx"], globalSetup: [], environment: "node", cache: false, fsModuleCache: false, reporters: ["verbose"] }, { configFile: false });'
```

- **Red:** exit 1, one failed suite: `ERR_MODULE_NOT_FOUND` for `../../src/components/ui`. The promised public module did not yet exist, so assertions could not execute.
- **Green:** exit 0, one passing file, **3 passing tests**. Repeated after the final edits: still 3 passing tests.

The tests use `react-dom/server` to verify an actual composed contribution form, the supplied brand asset, landmarks, navigation, labels/hints, constraints, disabled buttons, safe default button type, ReactNode labels, unique IDs, textual statuses, and literal preservation/escaping of message content. No internal implementation, DB, entitlement or ledger functions are mocked. These pure render tests need no database.

## Additional validation actually performed

```bash
ELECTRON_RUN_AS_NODE=1 "C:/Users/apsch/AppData/Local/Programs/Qoder/Qoder.exe" "C:/Users/apsch/Documents/personal/gifts-registry/node_modules/typescript/bin/tsc" --noEmit --incremental false
```

This returned exit 2 with four diagnostics outside the owned files, at the time of the run:

- `C:/Users/apsch/Documents/personal/gifts-registry/src/server/cards/render.ts:77`: unsupported `fontBuffers` option.
- `C:/Users/apsch/Documents/personal/gifts-registry/tests/cards/render.test.ts:56`: second argument not accepted.
- `C:/Users/apsch/Documents/personal/gifts-registry/tests/cards/render.test.ts:60`: missing `bleedMm` property.
- `C:/Users/apsch/Documents/personal/gifts-registry/tests/cards/render.test.ts:72`: optional `displayNameShown` incompatible with the required input.

There were no diagnostics in the owned implementation or tests. No build artifacts were written by typecheck.

The Tailwind aliases were also compiled in memory, without running a Next build or fetching fonts:

```bash
ELECTRON_RUN_AS_NODE=1 "C:/Users/apsch/AppData/Local/Programs/Qoder/Qoder.exe" --input-type=module -e 'import { createRequire } from "node:module"; import { dirname } from "node:path"; import { readFile } from "node:fs/promises"; import tailwind from "@tailwindcss/postcss"; const require=createRequire(import.meta.url); const postcss=require(require.resolve("postcss", { paths:[dirname(require.resolve("@tailwindcss/postcss"))] })); const source=await readFile("src/app/globals.css","utf8"); const output=await postcss([tailwind({base:process.cwd()})]).process(source,{from:"src/app/globals.css"}); console.log("OK: Tailwind globals compiled in memory; bytes="+output.css.length);'
```

Result: exit 0, `OK: Tailwind globals compiled in memory; bytes=10171`.

Browser checks served the actual public primitives and stylesheet through a temporary in-memory HTTP server bound to `127.0.0.1:3127`, without Next or Tailwind. That process was stopped and the browser restored to its original local app.

- At 320px and 1024px: no horizontal overflow; one-column and two-column grids respectively.
- Inputs/selects/buttons/button-like links: at least 48px tall; textarea 120px; input text 16px.
- Native checkbox, select, textarea, disabled button and labelled progressbar appeared correctly in the accessibility tree.
- Keyboard Tab exposed the skip link with a solid 3px focus outline. Input focus also had a solid 3px outline.
- The 512px supplied icon loaded. Piñata and its accessible brand label rendered with the correct ñ.
- Browser CSSOM contained all requested classes and both reduced-motion/forced-colour rules.
- Measured contrast ratios: pink on white 4.61, blue on white 4.77, small link ink on blue wash 5.45, muted ink on pink wash 5.73, teal eyebrow on pink wash 4.58. Blue price on blue wash 4.08 is used at 24px/600, meeting large-text contrast.

## Limitations

- The repo's unchanged Vitest config includes only `tests/**/*.test.ts` and always runs DB global setup. Therefore ordinary `pnpm test` does **not** discover this requested `.tsx` file; the in-memory command above does. No config/package/lock changes were authorised.
- The standalone stylesheet declares Syne/Manrope/Space Grotesk with sans-serif fallbacks. Next supplies those fonts through its existing font variables. Raw HTML uses the declared family if available, otherwise the fallback; no new font assets or external font requests were added.
- Screenshot capture was unavailable because the in-app browser had no visible surface. DOM/computed-style and accessibility-tree checks succeeded; no screenshot, axe audit, screen-reader certification, full Next build, or authenticated DB route run is claimed.
- No screen modules, routes, icons, configuration, CI, secrets or git operations were changed. No commits, pushes or live external API calls were made. Owned changes remain uncommitted as explicitly requested.
