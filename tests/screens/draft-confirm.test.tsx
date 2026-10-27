import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DraftConfirmScreen, type DraftScreenData } from '@/components/screens/draft-confirm';

const basePath = '/app/circles/demo-circle';
const extracted: DraftScreenData = {
  id: 'ingest-demo-1',
  title: 'Cycling shoes, size 43',
  retailer: 'Demo cycle shop',
  priceMinor: 249900,
  currency: 'ZAR',
  source: 'voice',
};

function render(draft: DraftScreenData | null = extracted, role: 'owner' | 'friend' = 'owner', notice?: string) {
  return renderToStaticMarkup(<DraftConfirmScreen draft={draft} basePath={basePath} role={role} notice={notice} />);
}

function input(html: string, name: string) {
  const tag = [...html.matchAll(/<input\b[^>]*>/g)].map(([tag]) => tag)
    .find((tag) => tag.includes(`name="${name}"`));
  expect(tag, `Expected a named ${name} input`).toBeDefined();
  return tag!;
}

function attribute(tag: string, name: string) {
  return tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, 'i'))?.[1];
}

function fields(html: string) {
  return [...html.matchAll(/<input\b[^>]*>/g)].map(([tag]) => attribute(tag, 'name'));
}

describe('DraftConfirmScreen public server render', () => {
  it('keeps extracted details pending until a person explicitly confirms', () => {
    const html = render();
    expect(html).toContain('Review your draft');
    expect(html).toContain('Nothing is added until you confirm');
    expect(html).toContain('Check the title, retailer and price');
    expect(html).toMatch(/<button\b[^>]*type="submit"[^>]*>Confirm and add item<\/button>/);
    expect(html.match(/<button\b[^>]*type="submit"/g)).toHaveLength(1);
    expect(html).not.toMatch(/<script|http-equiv="refresh"|autofocus|onload=|onsubmit=/i);
  });

  it('posts the reviewed values to the supplied base path with explicit confirm intent', () => {
    const html = render();
    expect(html).toMatch(/<form\b[^>]*action="\/app\/circles\/demo-circle\/draft"[^>]*method="post"/);
    expect(fields(html).sort()).toEqual(['currency', 'ingestEventId', 'intent', 'priceRand', 'retailer', 'title', 'visibility'].sort());
    expect(attribute(input(html, 'intent'), 'type')).toBe('hidden');
    expect(attribute(input(html, 'intent'), 'value')).toBe('confirm');
    expect(attribute(input(html, 'ingestEventId'), 'type')).toBe('hidden');
    expect(attribute(input(html, 'ingestEventId'), 'value')).toBe('ingest-demo-1');
    expect(attribute(input(html, 'currency'), 'value')).toBe('ZAR');
    expect(attribute(input(html, 'title'), 'value')).toBe(extracted.title);
    expect(attribute(input(html, 'retailer'), 'value')).toBe(extracted.retailer);
    expect(attribute(input(html, 'priceRand'), 'value')).toBe('2499');
  });

  it('lets a person correct every extracted field instead of locking model guesses', () => {
    const html = render();
    for (const name of ['title', 'retailer', 'priceRand']) {
      expect(input(html, name)).not.toMatch(/\b(?:readonly|disabled)=/i);
      expect(attribute(input(html, name), 'type')).not.toBe('hidden');
      expect(fields(html).filter((field) => field === name)).toHaveLength(1);
    }
    const corrected = render({ ...extracted, title: 'Cycling shoes, size 44', retailer: 'Corrected shop', priceMinor: 219900 });
    expect(attribute(input(corrected, 'title'), 'value')).toBe('Cycling shoes, size 44');
    expect(attribute(input(corrected, 'retailer'), 'value')).toBe('Corrected shop');
    expect(attribute(input(corrected, 'priceRand'), 'value')).toBe('2199');
    expect(attribute(input(corrected, 'ingestEventId'), 'value')).toBe(extracted.id);
    expect(corrected).not.toContain('2499');
    expect(corrected).toContain('Nothing is added until you confirm');
  });

  it('labels and constrains native fields, including a rand price nobody types in cents', () => {
    const html = render();
    for (const name of ['title', 'retailer', 'priceRand']) {
      const id = attribute(input(html, name), 'id');
      expect(id).toBeTruthy();
      expect(html).toContain(`<label for="${id}">`);
    }
    expect(attribute(input(html, 'title'), 'maxlength')).toBe('200');
    expect(input(html, 'title')).toContain('required=""');
    expect(input(html, 'retailer')).not.toContain('required=');
    expect(input(html, 'priceRand')).not.toContain('required=');
    expect(html).toContain('Price in rand');
    expect(attribute(input(html, 'priceRand'), 'type')).toBe('text');
    expect(input(html, 'priceRand')).toContain('inputMode="decimal"');
    expect(html).toContain('Like 1899 or 249.50');
    expect(html).not.toMatch(/cents/i);
    const hint = attribute(input(html, 'priceRand'), 'aria-describedby');
    expect(hint).toBeTruthy();
    expect(html).toContain(`id="${hint}"`);
  });

  it('offers honest blank manual entry without claiming any voice note was processed', () => {
    const html = render(null);
    expect(html).toContain('Add an item manually');
    expect(html).toContain('Manual entry');
    expect(html).toContain('No WhatsApp draft is loaded');
    expect(html).toContain('Nothing is added until you confirm');
    expect(fields(html)).not.toContain('ingestEventId');
    for (const name of ['title', 'retailer', 'priceRand']) {
      expect(attribute(input(html, name), 'value')).toBe('');
    }
    expect(attribute(input(html, 'currency'), 'value')).toBe('ZAR');
    expect(html).not.toMatch(/voice note (?:processed|transcribed)|extracted from your voice|connected to WhatsApp/i);
  });

  it('does not invent source provenance for a draft with no source or id', () => {
    const html = render({ title: 'Gift idea', retailer: null, priceMinor: null, currency: 'ZAR' });
    expect(html).toContain('Review your draft');
    expect(html).toContain('Unconfirmed draft');
    expect(fields(html)).not.toContain('ingestEventId');
    expect(html).not.toContain('From your voice note');
    expect(html).not.toContain('Manual entry');
  });

  it.each([0, null])('preserves a price of %s without guessing missing money', (priceMinor) => {
    const html = render({ ...extracted, retailer: null, priceMinor });
    expect(attribute(input(html, 'priceRand'), 'value')).toBe(priceMinor === null ? '' : '0');
    expect(attribute(input(html, 'retailer'), 'value')).toBe('');
  });

  it.each([extracted, null])('makes both drafted and manual friend additions friend-only', (draft) => {
    const html = render(draft, 'friend');
    expect(attribute(input(html, 'visibility'), 'type')).toBe('hidden');
    expect(attribute(input(html, 'visibility'), 'value')).toBe('friend_only');
    expect(html).toContain('Friends only');
    expect(html).toContain('The recipient won&#x27;t see this item');
    expect(html).not.toContain('owner_visible');
  });

  it('keeps owner rendering free of claims, pools and runtime extra ledger fields', () => {
    const overbroad = {
      ...extracted,
      claims: [{ displayName: 'SECRET_CLAIMER', status: 'claimed' }],
      pools: [{ targetMinor: 987654321, buyerName: 'SECRET_BUYER' }],
      contributions: [{ message: 'SECRET_CONTRIBUTOR_MESSAGE' }],
      visibility: 'friend_only',
    };
    const html = render(overbroad);
    expect(attribute(input(html, 'visibility'), 'value')).toBe('owner_visible');
    expect(html).not.toMatch(/SECRET_|987654321|friend_only|claim|pool|contribut/i);
  });

  it('explains the actual WhatsApp intake flow without fabricated links or connection status', () => {
    const html = render();
    expect(html).toContain('WhatsApp intake');
    expect(html).toContain('business number');
    expect(html).toContain('voice note');
    expect(html).toContain('product screenshot');
    expect(html).toContain('retailer link');
    expect(html).toContain('registered');
    expect(html).toContain('does not connect to WhatsApp or send messages');
    expect(html).not.toMatch(/wa\.me|api\.whatsapp\.com|whatsapp:\/\/|tel:|\+27\d{8,9}|connected to WhatsApp|processing your voice/i);
  });

  it('renders a supplied notice as escaped, announced text while retaining review controls', () => {
    const html = render(extracted, 'owner', 'Price must be whole cents. <script>alert(1)</script>');
    expect(html).toMatch(/role="status"/);
    expect(html).toContain('Price must be whole cents. &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Confirm and add item');
    expect(attribute(input(html, 'ingestEventId'), 'value')).toBe(extracted.id);
  });

  it('does not interpolate untrusted draft or source text as markup', () => {
    const html = render({ ...extracted, title: '<img src=x onerror=alert(1)>', retailer: 'Shop "quoted" & Co', source: '<script>source</script>' });
    expect(attribute(input(html, 'title'), 'value')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(attribute(input(html, 'retailer'), 'value')).toBe('Shop &quot;quoted&quot; &amp; Co');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
  });

  it('does not silently treat a foreign-currency draft as ZAR', () => {
    const html = render({ ...extracted, currency: 'USD', priceMinor: 2499 });
    expect(html).toContain('This draft uses USD, not ZAR');
    expect(html).toMatch(/<button\b[^>]*disabled=""[^>]*>Confirm and add item<\/button>/);
    expect(attribute(input(html, 'currency'), 'value')).toBe('USD');
    expect(attribute(input(html, 'priceRand'), 'value')).toBe('');
    expect(html).not.toContain('R24.99');
  });
});
