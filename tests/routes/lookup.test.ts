import { afterAll, beforeAll, expect, it } from 'vitest';
import { env } from '@/lib/env';
import { createDb, type Db } from '@/server/db/client';
import { handleLookupGet, handleLookupPost } from '@/server/routes/lookup';
import { handleCircleGet } from '@/server/routes/circle';
import { seedCircle, type CircleFixture } from '../leak/fixtures';

/**
 * Lookup lists discoverable public circles + always offers proxy create.
 * Miss/invalid stay byte-identical empty shells (no slug, no typed digits).
 * Hit shares status and shell headings; Open links are intentional on a hit.
 * Generated numbers only: this repo is public.
 */

let db: Db;
let fx: CircleFixture;

const suffix = String(Math.floor(10000 + Math.random() * 90000));
const num = (n: number) => `+999${suffix}${String(n).padStart(4, '0')}`;

beforeAll(async () => {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  fx = await seedCircle(url);
  db = fx.db;
});

afterAll(async () => {
  await db?.disconnect();
});

const appOrigin = new URL(env.CIRCLE_BASE_URL).origin;

function post(fields: Record<string, string>, origin = appOrigin): Promise<Response> {
  const body = new URLSearchParams(fields);
  return handleLookupPost(
    db,
    new Request('http://localhost/lookup', {
      method: 'POST',
      // Browsers send `Origin` on a same-origin form POST; the create branch requires it (F1).
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', origin },
      body,
    }),
  );
}

it('answers 200 with byte-identical empty shells for miss and invalid lookups', async () => {
  const missA = await post({ phone: num(41) });
  const missB = await post({ phone: num(42) });
  const invalid = await post({ phone: 'not-a-number' });
  for (const res of [missA, missB, invalid]) expect(res.status).toBe(200);
  const bodies = await Promise.all([missA, missB, invalid].map((r) => r.text()));
  expect(bodies[0]).toBe(bodies[1]);
  expect(bodies[1]).toBe(bodies[2]);
  expect(bodies[0]).toContain('Public circles');
  expect(bodies[0]).toContain('None listed here');
  expect(bodies[0]).toContain('Start a surprise circle');
});

it('leaks nothing on a miss: no slug, no /c/ href, no typed digits', async () => {
  const res = await post({ phone: num(43) });
  const body = await res.text();
  expect(body).not.toContain('/c/');
  expect(body).not.toContain(num(43));
  expect(body).not.toContain(fx.circleId);
});

it('lists discoverable circles on a hit with the same shell shape as a miss', async () => {
  const salt = `lk${suffix}`;
  const email = `public-${salt}@example.test`;
  const pepper = env.PHONE_HASH_PEPPER;
  const { hashEmail } = await import('@/server/auth/email-hash');
  const owner = await db.prisma.user.create({
    data: { displayName: 'Public Owner', email, emailHash: hashEmail(email, pepper) },
  });
  const publicCircle = await db.prisma.circle.create({
    data: {
      name: `Public ${salt}`,
      occasion: 'birthday',
      ownerUserId: owner.id,
      shareSlug: `pub-${salt}`,
      discoverable: true,
      status: 'active',
    },
  });
  await db.prisma.circle.create({
    data: {
      name: `Private ${salt}`,
      occasion: 'birthday',
      ownerUserId: owner.id,
      shareSlug: `prv-${salt}`,
      discoverable: false,
      status: 'active',
    },
  });
  const hit = await post({ identifier: email });
  const miss = await post({ phone: num(48) });
  expect(hit.status).toBe(200);
  expect(miss.status).toBe(200);
  const hitBody = await hit.text();
  const missBody = await miss.text();
  expect(hitBody).toContain('Public circles');
  expect(missBody).toContain('Public circles');
  expect(hitBody).toContain('Start a surprise circle');
  expect(missBody).toContain('Start a surprise circle');
  expect(hitBody).toContain(publicCircle.name);
  expect(hitBody).toContain(`/c/${publicCircle.shareSlug}`);
  expect(hitBody).not.toContain(`prv-${salt}`);
  expect(missBody).toContain('None listed here');
  expect(missBody).not.toContain('/c/');
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

it('folds a cross-origin create into the uniform offer body without a redirect or session (F1 login-CSRF)', async () => {
  const forged = await post(createFields(61, num(51)), 'https://evil.example');
  expect(forged.status).toBe(200);
  expect(forged.headers.get('Location')).toBeNull();
  expect(forged.headers.get('Set-Cookie')).toBeNull();
  const plain = await post({ phone: num(47) });
  expect(await forged.text()).toBe(await plain.text());
});

it('renders /lookup and the proxy offer inside the app shell with the explainer above the first field (CR-UX-02)', async () => {
  const get = handleLookupGet();
  expect(get.status).toBe(200);
  const getBody = await get.text();
  expect(getBody).toContain('/pinata.css');
  expect(getBody).toContain('register-sw.js');
  expect(getBody).toContain('Find or start a circle');

  const offerRes = await post({ phone: num(46) });
  expect(offerRes.status).toBe(200);
  const body = await offerRes.text();
  expect(body).toContain('/pinata.css');
  expect(body).toContain('Start a surprise circle');
  const explainer = 'You are starting a circle for someone else. They never need an account; you will get a link to share with the group, and the plan stays hidden from them.';
  expect(body).toContain(explainer);
  expect(body.indexOf(explainer)).toBeLessThan(body.indexOf('name="creatorName"'));
  expect(body).not.toContain('/c/');
});
