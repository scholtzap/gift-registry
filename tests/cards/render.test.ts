import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { renderCardArtwork, type CardArtwork } from '@/server/cards/render';
import { validateCardEntry } from '@/server/cards/validation';

const card = {
  itemTitle: 'Coffee grinder',
  recipientName: 'Naledi',
  occasion: 'birthday',
  pun: 'A little joy, just for you.',
  entries: [
    { displayNameShown: 'Thabo & Lerato', anonymous: false, message: '<b>Enjoy</b> & keep shining!' },
    { displayNameShown: 'Hidden fictional name', anonymous: true, message: 'Happy 30th!' },
  ],
};

function svgText(svg: string): string {
  // Satori emits one text node per word; inspect the document's observable text, not node shape.
  return [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]).join('')
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[entity]!);
}

function expectCanvasFit(result: CardArtwork): void {
  const transform = result.svg.match(/<g transform="translate\(([\d.e+-]+) 0\) scale\(([\d.e+-]+)\)">/)!;
  expect(transform).not.toBeNull();
  const [offset, scale] = [Number(transform[1]), Number(transform[2])];
  const height = result.height / result.width * 840;
  let nodes = 0;
  for (const node of result.svg.matchAll(/<(?:text|rect)\b[^>]*\bx="([\d.e+-]+)"[^>]*\by="([\d.e+-]+)"[^>]*\bwidth="([\d.e+-]+)"[^>]*\bheight="([\d.e+-]+)"/g)) {
    nodes++;
    const [x, y, width, nodeHeight] = node.slice(1).map(Number) as [number, number, number, number];
    expect(offset + x * scale).toBeGreaterThanOrEqual(0);
    expect(offset + (x + width) * scale).toBeLessThanOrEqual(840 + 0.001);
    expect(y * scale).toBeGreaterThanOrEqual(0);
    expect((y + nodeHeight) * scale).toBeLessThanOrEqual(height + 0.001);
  }
  expect(nodes).toBeGreaterThan(0);
}

const layouts = Array.from({ length: 8 }, (_, index) => index + 1).flatMap((count) =>
  (['screen', 'print'] as const).map((variant) => ({ count, variant })));

describe('deterministic card renderer boundary', () => {
  it('renders a valid screen PNG with literal escaped words and Anonymous attribution', async () => {
    const result = await renderCardArtwork(card);
    const metadata = await sharp(result.png).metadata();
    expect([metadata.format, metadata.width, metadata.height]).toEqual(['png', 840, 1184]);
    expect(svgText(result.svg)).toContain('Thabo & Lerato');
    expect(svgText(result.svg)).toContain('<b>Enjoy</b> & keep shining!');
    expect(svgText(result.svg)).toContain('Anonymous');
    expect(result.svg).not.toContain('Hidden fictional name');
    expect(result.svg).not.toMatch(/<script\b|<foreignObject\b|(?:xlink:)?href\s*=/i);
    expect(result.layout).toBe('group');
  });

  it('keeps all eight names and maximum-length messages inside the screen canvas', async () => {
    const entries = Array.from({ length: 8 }, (_, index) => ({
      displayNameShown: `Friend ${index + 1} ` + 'N'.repeat(71),
      message: (`Gift ${index + 1}: ` + 'Have a joyful day! '.repeat(12)).slice(0, 200),
      anonymous: false,
    }));
    const result = await renderCardArtwork({ ...card, entries });
    const text = svgText(result.svg);
    for (const entry of entries) {
      expect(text).toContain(entry.displayNameShown);
      expect(text).toContain(entry.message);
    }
    for (const node of result.svg.matchAll(/<text\b[^>]*\bx="([\d.-]+)"[^>]*\by="([\d.-]+)"[^>]*\bwidth="([\d.-]+)"[^>]*>/g)) {
      expect(Number(node[1])).toBeGreaterThanOrEqual(0);
      expect(Number(node[1]) + Number(node[3])).toBeLessThanOrEqual(841);
      expect(Number(node[2])).toBeLessThanOrEqual(1184);
    }
    expect(text).toContain('With love');
  });

  it.each(layouts)('fits $count maximum-width givers on $variant without truncation', async ({ count, variant }) => {
    const entries = Array.from({ length: count }, () => ({ displayNameShown: 'W'.repeat(80), message: 'W'.repeat(200), anonymous: false }));
    const result = await renderCardArtwork({ ...card, entries }, variant);
    const metadata = await sharp(result.png).metadata();
    expect([metadata.width, metadata.height]).toEqual(variant === 'print' ? [1311, 1819] : [840, 1184]);
    expect(result.layout).toBe(count === 1 ? 'solo' : 'group');
    expectCanvasFit(result);
    const text = svgText(result.svg);
    expect(text.split('W').length - 1).toBe(count * 280 + 1); // Contributor letters plus the footer's W.
    expect(text).toContain('With love');
  });

  it.each(layouts)('fits $count extreme literal multiline entries on $variant without dropping lines', async ({ count, variant }) => {
    const entries = Array.from({ length: count }, () => ({ displayNameShown: 'N\n'.repeat(40), message: 'x\n'.repeat(100), anonymous: false }));
    const result = await renderCardArtwork({ ...card, entries }, variant);
    expectCanvasFit(result);
    const text = svgText(result.svg);
    expect(text.split('x').length - 1).toBe(count * 100);
    expect(text.split('N').length - 1).toBe(count * 40 + 1); // Giver letters plus Naledi.
    expect(text).toContain('With love');
  });

  it.each(['screen', 'print'] as const)('refuses missing emoji/CJK/sequence glyphs on %s rather than exporting identical missing words', async (variant) => {
    for (const message of ['\u{1f389}', '\u{1f381}', '\u4f60\u597d', '\u751f\u65e5', 'Love \u2764\ufe0f', 'e\u{1ab0}']) {
      const entry = { ...card.entries[0]!, message };
      expect(() => validateCardEntry(entry)).not.toThrow(); // Saving literal words remains allowed.
      await expect(renderCardArtwork({ ...card, entries: [entry] }, variant)).rejects.toThrow('card_unsupported_glyph');
    }
  });

  it.each(['itemTitle', 'recipientName', 'occasion', 'pun', 'displayNameShown'] as const)('guards unsupported displayed %s glyphs too', async (field) => {
    const input = field === 'displayNameShown'
      ? { ...card, entries: [{ ...card.entries[0]!, displayNameShown: '\u4f60' }] }
      : { ...card, [field]: '\u4f60' };
    await expect(renderCardArtwork(input)).rejects.toThrow('card_unsupported_glyph');
  });

  it('does not require glyphs for an anonymous name that is never displayed', async () => {
    const result = await renderCardArtwork({ ...card, entries: [{ ...card.entries[0]!, anonymous: true, displayNameShown: '\u4f60' }] });
    expect(svgText(result.svg)).toContain('Anonymous');
    expect(svgText(result.svg)).not.toContain('\u4f60');
  });

  it('keeps supported accented words literal and visibly distinct in the PNG', async () => {
    const message = '  Pi\u00f1ata, caf\u00e9 & e\u0301!  ';
    const result = await renderCardArtwork({ ...card, entries: [{ ...card.entries[0]!, message }] });
    const other = await renderCardArtwork({ ...card, entries: [{ ...card.entries[0]!, message: '  Pinata, cafe & e!  ' }] });
    expect(svgText(result.svg)).toContain(message);
    expect(result.png).not.toEqual(other.png);
  });

  it('still refuses more than eight contributors explicitly', async () => {
    await expect(renderCardArtwork({ ...card, entries: Array.from({ length: 9 }, () => card.entries[0]!) }))
      .rejects.toThrow('card_contributor_limit');
  });

  it('renders A6 with 3 mm bleed at 300 DPI and a distinct solo layout', async () => {
    const result = await renderCardArtwork({ ...card, entries: [card.entries[0]!] }, 'print');
    const metadata = await sharp(result.png).metadata();
    expect([metadata.width, metadata.height, metadata.density]).toEqual([1311, 1819, 300]);
    expect(result.layout).toBe('solo');
    expect(result.bleedMm).toBe(3);
  });

  it('is byte-deterministic and never renders receipt fields supplied by a caller', async () => {
    const receipt = { ...card, amountMinor: 420000, note: 'paid by EFT', buyerLabel: 'Assigned buyer', retailer: 'Secret shop' };
    const first = await renderCardArtwork(receipt);
    const second = await renderCardArtwork(receipt);
    expect(first.png).toEqual(second.png);
    expect(svgText(first.svg)).not.toMatch(/420000|paid by EFT|Assigned buyer|Secret shop/);
  });

  it.each(['https://example.test', '192.0.2.1/deal', '[2001:db8::1]/deal', '::1/deal'])('refuses URL-bearing names/messages at the renderer boundary: %s', async (url) => {
    for (const field of ['displayNameShown', 'message'] as const) {
      await expect(renderCardArtwork({ ...card, entries: [{ ...card.entries[0]!, [field]: url }] }).then(() => undefined))
        .rejects.toThrow('invalid_card_entry');
    }
  });

  it('rasterises the actual words and treats script/foreignObject attempts as literal text', async () => {
    const message = '<script>alert("fixture")</script><foreignObject>Enjoy!</foreignObject>';
    const result = await renderCardArtwork({ ...card, entries: [{ ...card.entries[0]!, message }] });
    const other = await renderCardArtwork({ ...card, entries: [{ ...card.entries[0]!, message: 'A different message' }] });
    expect(svgText(result.svg)).toContain(message);
    expect(result.svg).not.toMatch(/<script\b|<foreignObject\b/i);
    // A valid but text-free PNG would have passed metadata tests; the pixels must carry the words.
    expect(Buffer.compare(Buffer.from(result.png), Buffer.from(other.png))).not.toBe(0);
  });
});
