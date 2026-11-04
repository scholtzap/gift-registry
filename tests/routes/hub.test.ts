import { afterAll, beforeAll, expect, it } from 'vitest';
import { env } from '@/lib/env';
import { createDb, type Db } from '@/server/db/client';
import { handleHubCreatePost } from '@/server/routes/hub';
import { handleCircleGet } from '@/server/routes/circle';
import { seedCircle } from '../leak/fixtures';

/** CR-UX-01: self-serve creation reuses ledger createCircle + owner session. Generated numbers only. */
let db: Db;
const suffix = String(Math.floor(10000 + Math.random() * 90000));
/** Reserved +999… range — not an assignable country code (AGENTS.md public-repo rule). */
const num = (n: number) => `+999${suffix}${String(n).padStart(4, '0')}`;
const mail = (n: number) => `hub-${suffix}-${n}@example.test`;
/** Too short for normalizeE164; proves national/incomplete input is refused. */
const notE164 = '+999';

beforeAll(async () => {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  const fx = await seedCircle(url);
  db = fx.db;
});
afterAll(async () => { await db?.disconnect(); });

const appOrigin = new URL(env.CIRCLE_BASE_URL).origin;

function post(path: string, fields: Record<string, string>, origin = appOrigin): Promise<Response> {
  return handleHubCreatePost(db, new Request(`http://localhost${path}`, {
    method: 'POST',
    // Every browser sends `Origin` on a same-origin form POST, so a real submit always carries it.
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', origin },
    body: new URLSearchParams(fields),
  }));
}

it('creates an owned circle, issues an owner session, and lands on the owner ledger with the share link', async () => {
  const email = mail(81);
  const res = await post('/app/create', {
    name: 'Hub Owner', occasion: 'birthday', eventDate: '2026-12-05', email, phone: num(81), wish: 'Hub first wish', discoverable: 'on',
  });
  expect(res.status).toBe(303);
  const location = res.headers.get('Location') ?? '';
  expect(location).toMatch(/^\/c\/[A-Za-z0-9_-]{16,}$/);
  const slug = decodeURIComponent(location.slice(3));
  const circle = await db.prisma.circle.findUnique({ where: { shareSlug: slug } });
  expect(circle?.ownerUserId).toBeTruthy();
  expect(circle?.discoverable).toBe(true);
  expect(circle?.name).toContain('Hub Owner');
  const owner = await db.prisma.user.findUnique({ where: { id: circle!.ownerUserId! }, select: { email: true } });
  expect(owner?.email).toBe(email);
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
  expect(body).not.toContain(email);
});

it('creates a circle without the optional date or wish', async () => {
  const res = await post('/app/create', { name: 'Minimal Owner', occasion: 'farewell', email: mail(82) });
  expect(res.status).toBe(303);
  expect(res.headers.get('Location')).toMatch(/^\/c\//);
  const slug = decodeURIComponent((res.headers.get('Location') ?? '').slice(3));
  const circle = await db.prisma.circle.findUnique({ where: { shareSlug: slug } });
  expect(circle?.discoverable).toBe(false);
});

it('rejects an invalid number with a 422 hub re-render and no circle', async () => {
  const before = await db.prisma.circle.count();
  const res = await post('/app/create', { name: 'Bad Phone', occasion: 'birthday', email: mail(84), phone: notE164 });
  expect(res.status).toBe(422);
  expect(await res.text()).toContain('Create my circle');
  expect(await db.prisma.circle.count()).toBe(before);
});

it('refuses a cross-origin create without minting a session or a circle (F1 login-CSRF)', async () => {
  const before = await db.prisma.circle.count();
  const res = await post(
    '/app/create',
    { name: 'Cross Origin', occasion: 'birthday', eventDate: '2026-12-05', phone: num(83) },
    'https://evil.example',
  );
  expect(res.status).toBe(422);
  expect(await res.text()).toContain('could not be verified');
  expect(res.headers.get('Set-Cookie')).toBeNull();
  expect(await db.prisma.circle.count()).toBe(before);
});
