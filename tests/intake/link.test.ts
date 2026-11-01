import { expect, it } from 'vitest';
import { assertPublicRetailerHost, expandRetailerLink, isPublicUnicast } from '@/server/intake/link';

const publicResolve = async () => [{ address: '203.0.113.10', family: 4 as const }];
const privateResolve = async () => [{ address: '169.254.169.254', family: 4 as const }];

it('expands a user-directed allowed retailer URL into a draft from JSON-LD without any model call', async () => {
  const http: typeof fetch = async () => new Response('<script type="application/ld+json">{"@type":"Product","name":"Fictional bicycle lamp","offers":{"price":"125.50","priceCurrency":"ZAR"}}</script>', { headers: { 'content-type': 'text/html' } });
  expect(await expandRetailerLink('https://www.specialized.com/fictional-lamp', http, publicResolve)).toMatchObject({ title: 'Fictional bicycle lamp', price_minor: 12550, currency: 'ZAR', canonical_url_guess: 'https://www.specialized.com/fictional-lamp' });
});

it('refuses the fetch when DNS answers a private address (SSRF rebinding guard)', async () => {
  let fetched = false;
  const http: typeof fetch = async () => { fetched = true; return new Response('', { headers: { 'content-type': 'text/html' } }); };
  await expect(expandRetailerLink('https://www.specialized.com/fictional-lamp', http, privateResolve)).rejects.toThrow('retailer_dns_rejected');
  expect(fetched).toBe(false);
});

it('rejects DNS failures without fetching', async () => {
  const failing = async () => { throw new Error('ENOTFOUND'); };
  await expect(assertPublicRetailerHost('www.specialized.com', failing)).rejects.toThrow('retailer_dns_rejected');
});

it('classifies public unicast addresses and rejects the rest', () => {
  for (const good of ['203.0.113.10', '197.155.20.1', '2001:db8::1', '2606:4700:4700::1111']) expect(isPublicUnicast(good)).toBe(true);
  for (const bad of ['10.0.0.1', '127.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fc00::1', 'ff02::1', 'not-an-ip']) expect(isPublicUnicast(bad)).toBe(false);
  // 172.15 and 172.32 are public; only 172.16/12 is private.
  expect(isPublicUnicast('172.15.0.1')).toBe(true);
  expect(isPublicUnicast('172.32.0.1')).toBe(true);
});
