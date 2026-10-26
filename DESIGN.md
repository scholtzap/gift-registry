# Piñata — DESIGN.md

**Chosen 2026-10-26:** V7 Neon Pastel, from the Stitch round (project `1263055774257026422`,
`assets/10321350346766620231`). Light-only ships; the dark Midnight Spark direction stays a rejected
variant. Token set lives in [src/app/globals.css](src/app/globals.css); this file is the taste document
that explains why those tokens are the ones.

## Brand

- **Name: Piñata.** The pooled money is the piñata: it stays shut, nobody sees inside, and it gets smashed
  open at the event. Owner-blindness in a party costume.
- **Spelling:** humans read **Piñata**; every URL, package name, env var, slug, domain and filename uses
  `pinata`. The ñ never appears in an identifier.
- **Tagline:** group gifts nobody can spoil.
- **Mark:** a donkey piñata, hand-authored SVG at [src/app/icon.svg](src/app/icon.svg) — pink body, crepe-paper
  waves in white/blue/pale-blue, blue hooves, one blue and one teal ear, teal tail tuft. Next serves it as
  favicon and app icon. Original geometry, not a trace of any stock art.
- **Wordmark:** live type — Syne 700, -0.02em — never traced paths, so the ñ renders correctly.
- **No cursive or script lettering anywhere**, including the wordmark.

## The idea

The gentlest reading of the brand: keep the pink-and-blue pairing but drop the glow and the black, and let
the two neons live as pastel washes on white. Party confetti in daylight, not a nightclub. It is the
friendliest variant of the round, which matters because the first screen most people see is a join link
opened inside WhatsApp's in-app browser.

## Colors

| Token | Hex | Use |
|---|---|---|
| `bg` | #FFFFFF | page ground |
| `wash-pink` | #FFE7F0 | human sections — contributors, card messages, the occasion |
| `wash-blue` | #E3EEFF | money sections — the pool, the summary, the deal strip |
| `wash-done` | #E7F7EE | a completed item's money half, with a green check |
| `primary` | #E11D63 | hot pink deepened one step so it holds AA on white. CTA, active states, the mark |
| `primary-pressed` | #BE1452 | pressed CTA |
| `on-primary` | #FFFFFF | text on pink |
| `secondary` | #1D6FE0 | electric blue deepened for AA. All amounts, progress fills, links |
| `tertiary` | #0E7490 | teal for eyebrows and metadata |
| `ink` | #14141C | headlines and body |
| `ink-2` | #5B5B66 | secondary text |
| `ink-3` | #A0A0AA | disabled text, strikethroughs |
| `hairline` | #E8E8EE | 1px rules inside washes |
| `track` | #DCE6FA | progress track |
| `disabled` | #F1F1F5 | disabled fill |
| `success` | #0F9D58 | funded / purchased |
| `warning` | #C2410C | not yet claimed |

Washes replace grey panels: section boundaries are wash edges, not borders.

## Typography

- **Syne 700** — gift title 32/36, section heads 19/24, wordmark 18px. Sentence case, -0.02em.
- **Manrope 400** 15/23 body; **600** for names and card messages.
- **Space Grotesk 600** 12px uppercase, 0.1em tracking, eyebrows; tabular figures for every amount.

## Shape and depth

18px on wash panels, 12px on buttons, full pill chips, circular avatars. **No shadows at all** except the
sticky bar's; depth comes from the washes and from 1px hairlines inside them.

## Buttons

- Primary: `primary` fill, white Syne 700 15px, 48px tall, 12px radius, no glow; pressed darkens to
  `primary-pressed`. One primary CTA per screen.
- Secondary: white fill, 1.5px `secondary` border, blue text.
- Tertiary: blue text only.
- Disabled: `disabled` fill, `ink-3` text — never greyed pink.

## Cards

Item card sits on a wash, one 18px panel with a hairline between the halves: the **human half** on
`wash-pink` (thumbnail 68px on white with a 1px `hairline` border, title Syne 700, contributor chips) and
the **money half** on `wash-blue` (progress 8px, track `track`, fill `secondary`; pledged / target /
remaining as tabular figures; your own slice marked with a pink caret). A completed item's money half turns
`wash-done` with a green check.

## Components

- **Chips:** full pill, white fill, 1px accent border, Space Grotesk 11px; the "You" chip is pink fill, white text.
- **Friends-only strip:** `wash-pink` panel, teal eyebrow `FRIENDS ONLY — <OWNER> MUST NOT SEE THIS`, blue
  price, `ink-3` strikethrough on the shop price, a small pink star glyph.
- **Card messages:** white quote panels inside the pink wash, 3px pink left rule, author Manrope 600,
  **no italics**.
- **Sticky bar:** white, top hairline, pink CTA, safe-area padding; the only shadow in the system.
- **Numeric emphasis:** the remaining amount renders 1.6x in `secondary`, **once per screen, never twice**.

## Product rules the UI must obey

- Owner view ≠ friend view: any new component declares which projection renders it.
- Deal suggestions reach friends only; the owner must not learn a cheaper option exists.
- The reveal is a human act: card routes get `robots: noindex` and no `og:` preview — the circle link lives
  in a WhatsApp group that contains the owner.
- The assistant never decides what happens next: fixed menu copy only, no free-form chat UI.
