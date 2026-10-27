import { expect, it } from 'vitest';
import { generateShareSlug } from '@/server/auth/slug';
import { trustedClientAddress } from '@/server/auth/client-address';

it('mints url-safe CSPRNG slugs of at least 16 characters that do not repeat', () => {
  const slugs = new Set(Array.from({ length: 512 }, () => generateShareSlug()));
  expect(slugs.size).toBe(512);
  for (const slug of slugs) {
    expect(slug.length).toBeGreaterThanOrEqual(16);
    expect(slug).toMatch(/^[A-Za-z0-9_-]+$/);
  }
});

it('ignores a client-claimed X-Forwarded-For when no trusted proxy is in front', () => {
  const request = new Request('http://localhost/lookup', {
    headers: { 'x-forwarded-for': '203.0.113.9' },
  });
  // RN-D: a forged header buys no extra throttle keys.
  expect(trustedClientAddress(request, '10.0.0.1', false)).toBe('10.0.0.1');
  expect(trustedClientAddress(request, undefined, false)).toBe('unknown');
});

it('takes the first forwarded address only when TRUSTED_PROXY is on', () => {
  const request = new Request('http://localhost/lookup', {
    headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
  });
  expect(trustedClientAddress(request, '10.0.0.2', true)).toBe('203.0.113.9');
  const bare = new Request('http://localhost/lookup');
  expect(trustedClientAddress(bare, '10.0.0.2', true)).toBe('10.0.0.2');
});
