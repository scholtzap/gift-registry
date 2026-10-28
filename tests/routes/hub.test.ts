import { afterAll, beforeAll, expect, it } from 'vitest';
import { createDb, type Db } from '@/server/db/client';
import { handleHubCreatePost, handleHubOpenPost, parseCircleSlug } from '@/server/routes/hub';
import { handleCircleGet } from '@/server/routes/circle';
import { seedCircle } from '../leak/fixtures';

/** CR-UX-01: self-serve creation reuses ledger createCircle + owner session. Generated numbers only. */
let db: Db;
const suffix = String(Math.floor(10000 + Math.random() * 90000));
const num = (n: number) => `+2783${suffix}${String(n).padStart(2, '0')}`;

beforeAll(async () => {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  const fx = await seedCircle(url);
  db = fx.db;
});
afterAll(async () => { await db?.disconnect(); });

function post(path: string, fields: Record<string, string>): Promise<Response> {
  return handleHubCreatePost(db, new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  }));
}

it('parseCircleSlug accepts a full link, a path and a bare slug, rejects junk', () => {
  expect(parseCircleSlug('https://pinata.scholtz.work/app/c/AbC_123-xyz?x=1')).toBe('AbC_123-xyz');
  expect(parseCircleSlug('/c/nadia-30th')).toBe('nadia-30th');
  expect(parseCircleSlug('nadia-30th')).toBe('nadia-30th');
  expect(parseCircleSlug('not a link!!')).toBeNull();
  expect(parseCircleSlug('')).toBeNull();
});

it('open-my-circle redirects a pasted link to /c/<slug> without an existence check', async () => {
  const res = await handleHubOpenPost(new Request('http://localhost/app/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ link: 'https://pinata.scholtz.work/app/c/SomeSlug_123-abc' }),
  }));
  expect(res.status).toBe(303);
  expect(res.headers.get('Location')).toBe('/c/SomeSlug_123-abc');
});

it('creates an owned circle, issues an owner session, and lands on the owner ledger with the share link', async () => {
  const res = await post('/app/create', {
    name: 'Hub Owner', occasion: 'birthday', eventDate: '2026-12-05', phone: num(81), wish: 'Hub first wish',
  });
  expect(res.status).toBe(303);
  const location = res.headers.get('Location') ?? '';
  expect(location).toMatch(/^\/c\/[A-Za-z0-9_-]{16,}$/);
  const slug = decodeURIComponent(location.slice(3));
  const circle = await db.prisma.circle.findUnique({ where: { shareSlug: slug } });
  expect(circle?.ownerUserId).toBeTruthy();
  expect(circle?.name).toContain('Hub Owner');
  const items = await db.prisma.item.findMany({ where: { circleId: circle!.id } });
  expect(items.map((i) => i.title)).toContain('Hub first wish');

  const cookie = res.headers.get('Set-Cookie') ?? '';
  expect(cookie).toContain('gc_session=');
  const page = await handleCircleGet(db, new Request(`http://localhost/c/${slug}`, { headers: { Cookie: cookie } }), slug);
  expect(page.status).toBe(200);
  const body = await page.text();
  expect(body).toContain('Hub first wish');
  expect(body).toContain('Your wishes');
  expect(body).toContain(`/c/${slug}`);
});

it('creates a circle without the optional date or wish', async () => {
  const res = await post('/app/create', { name: 'Minimal Owner', occasion: 'farewell', phone: num(82) });
  expect(res.status).toBe(303);
  expect(res.headers.get('Location')).toMatch(/^\/c\//);
});

it('rejects an invalid number with a 422 hub re-render and no circle', async () => {
  const before = await db.prisma.circle.count();
  const res = await post('/app/create', { name: 'Bad Phone', occasion: 'birthday', phone: '0831234567' });
  expect(res.status).toBe(422);
  expect(await res.text()).toContain('Create my circle');
  expect(await db.prisma.circle.count()).toBe(before);
});
