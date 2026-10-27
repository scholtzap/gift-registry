import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createElement as h, type CSSProperties } from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { validateCardEntry, type CardEntryInput } from './validation';

export interface CardArtworkData {
  itemTitle: string;
  recipientName: string;
  occasion: string;
  pun: string;
  entries: readonly CardEntryInput[];
}

export type CardVariant = 'screen' | 'print';

export interface CardArtwork {
  svg: string;
  png: Uint8Array;
  layout: 'solo' | 'group';
  width: number;
  height: number;
  dpi: number;
  bleedMm: number;
}

export class CardFontUnavailableError extends Error {
  constructor(cause: unknown) {
    super('card_font_unavailable: install a licensed local TTF asset', { cause });
    this.name = 'CardFontUnavailableError';
  }
}

export class CardUnsupportedGlyphError extends Error {
  constructor() {
    super('card_unsupported_glyph');
    this.name = 'CardUnsupportedGlyphError';
  }
}

// The bundled Geist TTF has a Unicode format-4 cmap. Refuse unknown font formats.
function fontGlyphs(bytes: Buffer): ReadonlySet<number> {
  let cmap = 0;
  for (let index = 0; index < bytes.readUInt16BE(4); index++) {
    const table = 12 + index * 16;
    if (bytes.toString('ascii', table, table + 4) === 'cmap') cmap = bytes.readUInt32BE(table + 8);
  }
  if (!cmap) throw new Error('missing_font_cmap');
  for (let index = 0; index < bytes.readUInt16BE(cmap + 2); index++) {
    const record = cmap + 4 + index * 8;
    const platform = bytes.readUInt16BE(record);
    const encoding = bytes.readUInt16BE(record + 2);
    if (platform !== 0 && !(platform === 3 && encoding === 1)) continue;
    const table = cmap + bytes.readUInt32BE(record + 4);
    if (bytes.readUInt16BE(table) !== 4) continue;
    const segments = bytes.readUInt16BE(table + 6) / 2;
    const endCodes = table + 14;
    const startCodes = endCodes + segments * 2 + 2;
    const deltas = startCodes + segments * 2;
    const offsets = deltas + segments * 2;
    const glyphs = new Set<number>();
    for (let segment = 0; segment < segments; segment++) {
      const start = bytes.readUInt16BE(startCodes + segment * 2);
      const end = bytes.readUInt16BE(endCodes + segment * 2);
      const delta = bytes.readInt16BE(deltas + segment * 2);
      const offsetPosition = offsets + segment * 2;
      const offset = bytes.readUInt16BE(offsetPosition);
      for (let code = start; code <= end && code < 0xFFFF; code++) {
        const glyph = offset ? bytes.readUInt16BE(offsetPosition + offset + (code - start) * 2) : code;
        if ((!offset || glyph !== 0) && ((glyph + delta) & 0xFFFF) !== 0) glyphs.add(code);
      }
    }
    return glyphs;
  }
  throw new Error('unsupported_font_cmap');
}

interface CardFont { bytes: Buffer; path: string; glyphs: ReadonlySet<number> }
let fontBytes: Promise<CardFont> | undefined;
function loadFont(): Promise<CardFont> {
  fontBytes ??= (async () => {
    try {
      const path = join(process.cwd(), 'node_modules', 'next', 'dist', 'compiled', '@vercel', 'og', 'Geist-Regular.ttf');
      const bytes = await readFile(path);
      return { bytes, path, glyphs: fontGlyphs(bytes) };
    } catch (cause) {
      fontBytes = undefined;
      throw new CardFontUnavailableError(cause);
    }
  })();
  return fontBytes;
}

function assertCardGlyphs(text: string, font: CardFont): void {
  for (const character of text) {
    // Line breaks and tabs are layout controls, not printable glyphs.
    if (!/[\t\r\n]/u.test(character) && !font.glyphs.has(character.codePointAt(0)!)) {
      throw new CardUnsupportedGlyphError();
    }
  }
}

function cardText(text: string, style: CSSProperties) {
  return h('div', { style: { ...style, display: 'flex', flexDirection: 'column', flexShrink: 0 } },
    ...text.split(/\r\n|\r|\n/u).map((line) => h('div', {
      style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all', flexShrink: 0, minHeight: Number(style.fontSize) * 1.2 },
    }, line)));
}

/** Local-only typography; no user markup, remote images, or generated layout enters this tree. */
export async function renderCardArtwork(data: CardArtworkData, variant: CardVariant = 'screen'): Promise<CardArtwork> {
  if (data.entries.length < 1 || data.entries.length > 8) throw new Error('card_contributor_limit');
  const validated = data.entries.map(validateCardEntry);
  const font = await loadFont();
  for (const text of [data.itemTitle, data.recipientName, data.occasion, data.pun,
    ...validated.flatMap((entry) => [entry.anonymous ? 'Anonymous' : entry.displayNameShown, entry.message]),
    'Piñata', 'For ', 'With love']) assertCardGlyphs(text, font);
  const width = variant === 'print' ? 1311 : 840;
  const height = variant === 'print' ? 1819 : 1184;
  const dpi = variant === 'print' ? 300 : 96;
  const logicalHeight = height / width * 840;
  const layout = validated.length === 1 ? 'solo' : 'group';
  const renderLayout = async (compact: boolean) => {
    const gap = compact ? 12 : 20;
    const padding = compact ? 44 : 64;
    const panelWidth = layout === 'solo' ? 840 - padding * 2 : (840 - padding * 2 - gap) / 2;
    const entries = validated.map((entry) => h('div', {
      style: {
        display: 'flex', flexDirection: 'column', boxSizing: 'border-box', width: panelWidth, flexShrink: 0,
        backgroundColor: '#FFFFFF', borderLeft: '3px solid #E11D63', padding: compact ? 12 : 20, borderRadius: 12,
      },
    },
    cardText(entry.anonymous ? 'Anonymous' : entry.displayNameShown, { fontSize: compact ? 13 : 22, lineHeight: 1.2, marginBottom: compact ? 6 : 10 }),
    cardText(entry.message, { fontSize: compact ? 12 : 20, lineHeight: 1.2 })));

    const tree = h('div', {
      style: {
        display: 'flex', flexDirection: 'column', boxSizing: 'border-box', width: 840, minHeight: logicalHeight,
        backgroundColor: '#FFE7F0', color: '#14141C', padding, fontFamily: 'Geist', wordBreak: 'break-all',
      },
    },
    h('div', { style: { fontSize: compact ? 16 : 20, color: '#0E7490', marginBottom: compact ? 16 : 28 } }, 'Piñata'),
    h('div', { style: { fontSize: compact ? 22 : 28, color: '#E11D63', marginBottom: 12 } }, `For ${data.recipientName}`),
    h('div', { style: { fontSize: compact ? 32 : 48, lineHeight: 1.1, marginBottom: 12 } }, data.itemTitle),
    h('div', { style: { fontSize: compact ? 16 : 20, color: '#5B5B66', marginBottom: compact ? 16 : 32 } }, data.occasion),
    h('div', { style: { fontSize: compact ? 24 : 30, lineHeight: 1.3, marginBottom: compact ? 16 : 32 } }, data.pun),
    h('div', { style: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', flexShrink: 0, gap } }, ...entries),
    h('div', { style: { fontSize: 16, color: '#5B5B66', marginTop: 'auto', paddingTop: 24 } }, 'With love'));

    let contentHeight = logicalHeight;
    let overflow = false;
    const svg = await satori(tree, {
      // Measure natural height first: a fixed-height flex root can hide overflowing children.
      width: 840, embedFont: false,
      fonts: [{ name: 'Geist', data: font.bytes, weight: 400, style: 'normal' }],
      loadAdditionalAsset: async () => { throw new CardUnsupportedGlyphError(); },
      onNodeDetected: (node) => {
        if (![node.left, node.top, node.width, node.height].every(Number.isFinite)
          || node.left < 0 || node.top < 0 || node.left + node.width > 840 + 0.000001) overflow = true;
        contentHeight = Math.max(contentHeight, node.top + node.height);
      },
    });
    if (overflow || !Number.isFinite(contentHeight)) throw new Error('card_layout_overflow');
    return { svg, contentHeight };
  };

  let measured = await renderLayout(validated.length > 4);
  if (validated.length <= 4 && measured.contentHeight > logicalHeight) measured = await renderLayout(true);
  const scale = Math.min(1, logicalHeight / measured.contentHeight);
  const body = measured.svg.match(/^<svg\b[^>]*>([\s\S]*)<\/svg>$/)?.[1];
  if (!body) throw new Error('unsafe_card_svg');
  // Uniformly fit the measured tree, retaining every text node and explicit blank line.
  const svg = `<svg width="840" height="${logicalHeight}" viewBox="0 0 840 ${logicalHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="840" height="${logicalHeight}" fill="#FFE7F0"/><g transform="translate(${(840 - 840 * scale) / 2} 0) scale(${scale})">${body}</g></svg>`;
  if (/<script\b|<foreignObject\b|<[a-z][^>]*\s(?:xlink:)?href\s*=/i.test(svg)) throw new Error('unsafe_card_svg');
  const raster = new Resvg(svg, {
    fitTo: { mode: 'width', value: width }, font: { fontFiles: [font.path], loadSystemFonts: false },
  }).render().asPng();
  // SVG engines round the fractional A6 viewport differently; pin the final pixel dimensions.
  const png = await sharp(raster).resize(width, height, { fit: 'fill' }).withMetadata({ density: dpi }).png().toBuffer();
  return { svg, png, layout, width, height, dpi, bleedMm: variant === 'print' ? 3 : 0 };
}
