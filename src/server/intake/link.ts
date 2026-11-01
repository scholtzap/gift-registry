import { lookup as dnsLookup } from 'node:dns/promises';
import { wishSchema, type WishDraft } from '@/server/models/client';
import { requestBytes } from '@/server/wa/http';

const RETAILERS = new Set(['www.specialized.com', 'specialized.com', 'www.takealot.com', 'takealot.com', 'www.capeunionmart.co.za', 'www.sportsmanswarehouse.co.za']);

interface DnsAnswer {
  address: string;
  family: number;
}

type DnsLookup = (hostname: string) => Promise<DnsAnswer[]>;

const defaultResolve: DnsLookup = (hostname) => dnsLookup(hostname, { all: true });

/**
 * SSRF guard for the 4 allowlisted retailer hosts. The hostname allowlist,
 * https-only and redirect:error bound the shape of the request, but DNS can
 * still answer a public name with a private address (rebinding) — so every
 * resolved address must be public unicast before fetch runs. Inject `resolve`
 * in tests to avoid real DNS.
 *
 * Residual TOCTOU: the fetch re-resolves minutes later through the system
 * resolver. The window is one 5s bounded request with no redirects and no
 * credentials, and the response must be same-shape HTML product metadata —
 * documented, not ignored.
 */
export function isPublicUnicast(address: string): boolean {
  if (address.includes(':')) {
    const first = address.toLowerCase().split(':')[0] ?? '';
    const h = first === '' ? 0 : Number.parseInt(first, 16);
    if (!Number.isSafeInteger(h) || h < 0 || h > 0xffff) return false;
    if (h === 0) return false; // ::/128 (unspecified) or ::1 (loopback)
    if ((h & 0xff00) === 0xff00) return false; // ff00::/8 multicast
    if ((h & 0xfe00) === 0xfc00) return false; // fc00::/7 unique-local
    if ((h & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
    if ((h & 0xffc0) === 0xfec0) return false; // fec0::/10 site-local (deprecated)
    return true;
  }
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return false;
  if (a === 127) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 169 && b === 254) return false;
  if (a === 0 || a >= 224) return false;
  return true;
}

export async function assertPublicRetailerHost(
  hostname: string,
  resolve: DnsLookup = defaultResolve,
): Promise<void> {
  let answers: Array<{ address: string; family: number }>;
  try {
    answers = await resolve(hostname);
  } catch {
    throw new Error('retailer_dns_rejected');
  }
  if (!answers.length || !answers.every((a) => isPublicUnicast(a.address))) {
    throw new Error('retailer_dns_rejected');
  }
}

function minor(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) return null;
  const result = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return result <= 2147483647 ? result : null;
}
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, 200) : null;
}

/** No redirects, credentials, private hosts, Marketplace, or model needed for complete metadata. */
export async function expandRetailerLink(input: string, http: typeof fetch = fetch, resolve: DnsLookup = defaultResolve): Promise<WishDraft | null> {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !RETAILERS.has(url.hostname)) throw new Error('retailer_url_rejected');
  await assertPublicRetailerHost(url.hostname, resolve);
  const response = await requestBytes(http, url.href, { headers: { Accept: 'text/html' } }, 1024 * 1024, 5000);
  if (!/^text\/html(?:;|$)/i.test(response.contentType)) throw new Error('retailer_content_rejected');
  const html = response.bytes.toString('utf8');
  let title: string | null = null;
  let price: number | null = null;
  let currency: unknown;
  for (const script of html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    let json: unknown;
    try { json = JSON.parse(script[1]!); } catch { continue; }
    const root = json && typeof json === 'object' && !Array.isArray(json) ? json as Record<string, unknown> : null;
    const candidates = Array.isArray(json) ? json : root && Array.isArray(root['@graph']) ? root['@graph'] : [json];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object' || candidate['@type'] !== 'Product') continue;
      const product = candidate as Record<string, unknown>;
      const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
      title = text(product.name);
      if (offer && typeof offer === 'object') { price = minor(offer.price); currency = offer.priceCurrency; }
      if (title) break;
    }
    if (title) break;
  }
  const meta: Record<string, string> = {};
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs: Record<string, string> = {};
    for (const attr of tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[attr[1]!.toLowerCase()] = attr[2] ?? attr[3]!;
    const key = attrs.property ?? attrs.name;
    if (key && attrs.content) meta[key.toLowerCase()] = attrs.content.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  }
  title ??= text(meta['og:title']);
  price ??= minor(meta['product:price:amount'] ?? meta['og:price:amount']);
  currency ??= meta['product:price:currency'] ?? meta['og:price:currency'];
  if (!title || price === null || currency !== 'ZAR') return null;
  return wishSchema.parse({ title, brand: null, size: null, price_minor: price, currency: 'ZAR', canonical_url_guess: url.href });
}
