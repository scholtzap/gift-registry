import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '@/server/db/client';
import { env } from '@/lib/env';
import { derivedCircleStatus, isArchived } from '@/server/lifecycle';
import { handleLookupPost } from '@/server/routes/lookup';
import { handleCircleGet, handleCirclePost } from '@/server/routes/circle';

/**
 * RN-E: the archive transition is derived on read (no scheduler), applies
 * only to proxy circles, keeps the circle readable, and refuses new claims.
 */

const proxy = (createdAt: string, eventDate: string) => ({
  status: 'active',
  createdAt: new Date(createdAt),
  eventDate: new Date(eventDate),
  ownerUserId: null,
});

describe('derivedCircleStatus', () => {
  it('archives a proxy circle 72h after the event date, then purges at +90 days', () => {
    const circle = proxy('2026-01-01T00:00:00Z', '2026-01-10T00:00:00Z');
    expect(derivedCircleStatus(circle, new Date('2026-01-12T00:00:00Z'))).toBe('active');
    expect(derivedCircleStatus(circle, new Date('2026-01-13T00:00:01Z'))).toBe('archived');
    expect(derivedCircleStatus(circle, new Date('2026-04-14T00:00:00Z'))).toBe('purged');
  });

  it('archives at the end of the event day when the day came early, never before it', () => {
    const circle = proxy('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
    expect(derivedCircleStatus(circle, new Date('2026-01-02T12:00:00Z'))).toBe('active');
    expect(derivedCircleStatus(circle, new Date('2026-01-03T00:00:00Z'))).toBe('archived');
  });

  it('never archives an owner-run circle, and closed stays closed', () => {
    const owned = { ...proxy('2026-01-01T00:00:00Z', '2026-01-10T00:00:00Z'), ownerUserId: 'u1' };
    expect(derivedCircleStatus(owned, new Date('2027-01-01T00:00:00Z'))).toBe('active');
    expect(isArchived(owned, new Date('2027-01-01T00:00:00Z'))).toBe(false);
    expect(derivedCircleStatus({ ...proxy('2026-01-01T00:00:00Z', '2026-01-10T00:00:00Z'), status: 'closed' }, new Date('2026-01-02T00:00:00Z'))).toBe('closed');
  });
});

let db: Db;
const suffix = String(Math.floor(10000 + Math.random() * 90000));
const num = (n: number) => `+2783${suffix}${String(n).padStart(2, '0')}`;
const origin = new URL(env.CIRCLE_BASE_URL).origin;

beforeAll(async () => {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  db = createDb(url);
});

afterAll(async () => {
  await db?.disconnect();
});

it('an archived proxy circle is still readable by its members but refuses a new claim', async () => {
  // Event date yesterday: created today, so the early-day rule archives it
  // at the end of the event day, which has passed.
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const created = await handleLookupPost(db, new Request('http://localhost/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', origin },
    body: new URLSearchParams({
      intent: 'create', creatorName: 'Creator Friend', creatorPhone: num(31),
      recipientPhone: num(32), recipientLabel: 'A Friend', occasion: 'birthday',
      eventDate: yesterday, itemTitle: 'Trail runners',
    }),
  }));
  expect(created.status).toBe(303);
  const slug = decodeURIComponent((created.headers.get('Location') ?? '').slice(3));
  const cookie = created.headers.get('Set-Cookie') ?? '';
  const circle = await db.prisma.circle.findUnique({ where: { shareSlug: slug } });
  expect(circle && isArchived(circle)).toBe(true);

  const page = await handleCircleGet(db, new Request(`${origin}/c/${slug}`, { headers: { Cookie: cookie } }), slug);
  expect(page.status).toBe(200);
  expect(await page.text()).toContain('Trail runners');

  const item = await db.prisma.item.findFirst({ where: { circleId: circle!.id } });
  const claim = await handleCirclePost(db, new Request(`${origin}/c/${slug}/items/${item!.id}`, {
    method: 'POST',
    headers: { cookie, origin, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ intent: 'claim' }),
  }), slug);
  expect(claim.status).toBe(409);
});
