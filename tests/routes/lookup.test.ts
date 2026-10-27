import { afterAll, beforeAll, expect, it } from 'vitest';
import { createDb, type Db } from '@/server/db/client';
import { handleLookupPost } from '@/server/routes/lookup';
import { handleCircleGet } from '@/server/routes/circle';
import { seedCircle, type CircleFixture } from '../leak/fixtures';

/**
 * RN-B create-only + RN-C create path. The invariant under test is the
 * always-200 rule as the owner narrowed it (RN-D G1): the lookup renders no
 * existing registry, so registered, unregistered and invalid numbers receive
 * byte-identical answers, and no body carries a slug, a /c/ href, or digits
 * the caller typed. Generated numbers only: this repo is public.
 */

let db: Db;
let fx: CircleFixture;

const suffix = String(Math.floor(10000 + Math.random() * 90000));
const num = (n: number) => `+2783${suffix}${String(n).padStart(2, '0')}`;

beforeAll(async () => {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  fx = await seedCircle(url);
  db = fx.db;
});

afterAll(async () => {
  await db?.disconnect();
});

function post(fields: Record<string, string>): Promise<Response> {
  const body = new URLSearchParams(fields);
  return handleLookupPost(
    db,
    new Request('http://localhost/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }),
  );
}

it('answers 200 with byte-identical bodies for registered, unregistered and invalid numbers', async () => {
  const registered = await post({ phone: num(41) });
  const unregistered = await post({ phone: num(42) });
  const invalid = await post({ phone: 'not-a-number' });
  for (const res of [registered, unregistered, invalid]) expect(res.status).toBe(200);
  const bodies = await Promise.all([registered, unregistered, invalid].map((r) => r.text()));
  expect(bodies[0]).toBe(bodies[1]);
  expect(bodies[1]).toBe(bodies[2]);
});

it('leaks nothing in the lookup body: no slug, no /c/ href, no typed digits', async () => {
  const res = await post({ phone: num(43) });
  const body = await res.text();
  expect(body).not.toContain('/c/');
  expect(body).not.toContain(num(43));
  expect(body).not.toContain(fx.circleId);
});

it('throttles a burst on one number with the uniform body plus Retry-After', async () => {
  let last: Response | undefined;
  for (let i = 0; i < 6; i++) last = await post({ phone: num(44) });
  expect(last?.status).toBe(200);
  expect(last?.headers.get('Retry-After')).toBeTruthy();
  expect(await last!.text()).toBe(await (await post({ phone: num(45) })).text().catch(() => ''));
});

const createFields = (n: number, creator = num(50)) => ({
  intent: 'create',
  creatorName: 'Creator Friend',
  creatorPhone: creator,
  recipientPhone: num(n),
  recipientLabel: 'A Friend',
  occasion: 'birthday',
  eventDate: '2026-12-05',
  itemTitle: 'Trail runners',
});

it('creates a proxy circle: 303 to a CSPRNG slug, digest-only recipient, creator is a plain friend', async () => {
  const res = await post(createFields(60));
  expect(res.status).toBe(303);
  const location = res.headers.get('Location') ?? '';
  expect(location).toMatch(/^\/c\/[A-Za-z0-9_-]{16,}$/);
  const slug = decodeURIComponent(location.slice(3));
  const circle = await db.prisma.circle.findUnique({ where: { shareSlug: slug } });
  expect(circle?.ownerUserId).toBeNull();
  expect(circle?.recipientPhoneE164Hash).toMatch(/^[a-f0-9]{64}$/);
  const memberships = await db.prisma.membership.findMany({ where: { circleId: circle!.id } });
  expect(memberships).toHaveLength(1);
  expect(memberships[0]?.role).toBe('friend');
  // The creator can open the circle with the issued session cookie.
  const cookie = res.headers.get('Set-Cookie') ?? '';
  const page = await handleCircleGet(
    db,
    new Request(`http://localhost/c/${slug}`, { headers: { Cookie: cookie } }),
    slug,
  );
  expect(page.status).toBe(200);
  expect(await page.text()).toContain('Trail runners');
});

it('refuses an 11th proxy circle from one creator in 24h with the uniform offer body', async () => {
  const creator = num(70);
  for (let i = 0; i < 10; i++) {
    expect((await post(createFields(71 + i, creator))).status).toBe(303);
  }
  const eleventh = await post(createFields(90, creator));
  expect(eleventh.status).toBe(200);
  expect(eleventh.headers.get('Location')).toBeNull();
});
