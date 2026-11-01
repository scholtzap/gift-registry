import { afterAll, beforeAll, expect, it } from 'vitest';
import { env } from '@/lib/env';
import { SESSION_COOKIE, issueSession } from '@/server/auth/session';
import { handleCircleGet } from '@/server/routes/circle';
import { handleLookupGet } from '@/server/routes/lookup';
import { seedCircle, type CircleFixture } from '../leak/fixtures';

/**
 * F10/F11: every HTML surface carries a tight Content-Security-Policy and the
 * shared shell carries no `og:` preview tags (the reveal is a human act; no
 * card route may be previewable or cacheable). The owner projection additionally
 * carries no deal language — deal suggestions reach friends only.
 */

let fx: CircleFixture;
let db: CircleFixture['db'];
let slug: string;

beforeAll(async () => {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  fx = await seedCircle(url);
  db = fx.db;
  const circle = await db.prisma.circle.findUnique({ where: { id: fx.circleId }, select: { shareSlug: true } });
  slug = circle!.shareSlug;
});

afterAll(async () => {
  await db?.disconnect();
});

const appOrigin = new URL(env.CIRCLE_BASE_URL).origin;

function expectHardened(res: Response) {
  const csp = res.headers.get('Content-Security-Policy') ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  // Turnstile widget allowance only; no other third-party script or frame.
  expect(csp).toContain('https://challenges.cloudflare.com');
  expect(res.headers.get('Cache-Control')).toContain('private, no-store');
  expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
}

it('serves the lookup shell with CSP, no-store and no preview tags', async () => {
  const res = handleLookupGet();
  expect(res.status).toBe(200);
  expectHardened(res);
  const body = await res.text();
  expect(body).not.toContain('og:');
  expect(body).not.toContain('<meta property="og:');
});

it('serves the circle gate with CSP, no-store and no preview tags', async () => {
  const res = await handleCircleGet(db, new Request(`${appOrigin}/c/${slug}`), slug);
  expect(res.status).toBe(200);
  expectHardened(res);
  const body = await res.text();
  expect(body).not.toContain('og:');
});

it('renders the owner ledger with CSP and without deal language or claim shapes', async () => {
  const cookie = `${SESSION_COOKIE}=${issueSession({ userId: fx.ownerUserId, circleId: fx.circleId, role: 'owner' })}`;
  const res = await handleCircleGet(db, new Request(`${appOrigin}/c/${slug}`, { headers: { cookie } }), slug);
  expect(res.status).toBe(200);
  expectHardened(res);
  const body = await res.text();
  expect(body).not.toContain('og:');
  expect(body).not.toMatch(/deal|cheaper|discount|pool|claim|contribution/i);
});
