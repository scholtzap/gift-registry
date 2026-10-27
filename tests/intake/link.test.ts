import { expect, it } from 'vitest';
import { expandRetailerLink } from '@/server/intake/link';

it('expands a user-directed allowed retailer URL into a draft from JSON-LD without any model call', async () => {
  const http: typeof fetch = async () => new Response('<script type="application/ld+json">{"@type":"Product","name":"Fictional bicycle lamp","offers":{"price":"125.50","priceCurrency":"ZAR"}}</script>', { headers: { 'content-type': 'text/html' } });
  expect(await expandRetailerLink('https://www.specialized.com/fictional-lamp', http)).toMatchObject({ title: 'Fictional bicycle lamp', price_minor: 12550, currency: 'ZAR', canonical_url_guess: 'https://www.specialized.com/fictional-lamp' });
});
