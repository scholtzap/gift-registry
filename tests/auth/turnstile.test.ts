import { afterEach, beforeEach, expect, it } from 'vitest';
import { checkTurnstile, turnstileField, verifyTurnstileToken } from '@/server/auth/turnstile';

/**
 * F12: the bot gate is an open seam until TURNSTILE_SECRET is set, then it
 * fails closed. The widget posts Cloudflare's `cf-turnstile-response` field.
 */

const saved = process.env.TURNSTILE_SECRET;

beforeEach(() => {
  delete process.env.TURNSTILE_SECRET;
});

afterEach(() => {
  if (saved === undefined) delete process.env.TURNSTILE_SECRET;
  else process.env.TURNSTILE_SECRET = saved;
});

const request = () => new Request('http://localhost/c/abc', { method: 'POST' });
const okFetch = (success: boolean): typeof fetch =>
  (async () => new Response(JSON.stringify({ success }), { headers: { 'content-type': 'application/json' } })) as typeof fetch;
const failingFetch = (async () => {
  throw new Error('network down');
}) as unknown as typeof fetch;

it('stays open when no secret is configured (dev/demo/test seam)', async () => {
  expect(await checkTurnstile(request(), null)).toBe(true);
  expect(await checkTurnstile(request(), 'any-token')).toBe(true);
});

it('requires a token once the secret is set', async () => {
  process.env.TURNSTILE_SECRET = 'synthetic-turnstile-secret-not-a-key';
  expect(await checkTurnstile(request(), null)).toBe(false);
  expect(await checkTurnstile(request(), '')).toBe(false);
});

it('accepts a verified token and denies failures closed', async () => {
  process.env.TURNSTILE_SECRET = 'synthetic-turnstile-secret-not-a-key';
  expect(await checkTurnstile(request(), 'human-token', okFetch(true))).toBe(true);
  expect(await checkTurnstile(request(), 'bot-token', okFetch(false))).toBe(false);
  expect(await checkTurnstile(request(), 'human-token', failingFetch)).toBe(false);
});

it('reads the Cloudflare widget field and rejects junk', () => {
  const form = new FormData();
  expect(turnstileField(form)).toBeNull();
  form.set('cf-turnstile-response', 'token-123');
  expect(turnstileField(form)).toBe('token-123');
  form.set('cf-turnstile-response', '   ');
  expect(turnstileField(form)).toBeNull();
});

it('verifies against the Cloudflare endpoint and rejects bad JSON', async () => {
  const secret = 'synthetic-turnstile-secret-not-a-key';
  expect(await verifyTurnstileToken('t', secret, undefined, okFetch(true))).toBe(true);
  expect(await verifyTurnstileToken('t', secret, undefined, okFetch(false))).toBe(false);
  const htmlFetch = (async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } })) as typeof fetch;
  expect(await verifyTurnstileToken('t', secret, undefined, htmlFetch)).toBe(false);
});
