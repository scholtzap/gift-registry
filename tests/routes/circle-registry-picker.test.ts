import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Db } from '@/server/db/client';
import { handleCircleGet, handleCirclePost } from '@/server/routes/circle';
import { issueSession, SESSION_COOKIE } from '@/server/auth/session';
import { createRegistryItem } from '@/server/ledger/registry';
import { env } from '@/lib/env';
import { seedCircle, type CircleFixture } from '../leak/fixtures';

/**
 * Per-circle Sharing (/c/<slug>/registry): link hidden, preview stamps, then show.
 */

let fx: CircleFixture;
let db: Db;
let slug: string;
const origin = new URL(env.CIRCLE_BASE_URL).origin;

beforeAll(async () => {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  fx = await seedCircle(url);
  db = fx.db;
  slug = (await db.prisma.circle.findUniqueOrThrow({ where: { id: fx.circleId } })).shareSlug;
});

afterAll(async () => {
  await db?.disconnect();
});

const cookie = () =>
  `${SESSION_COOKIE}=${issueSession({ userId: fx.ownerUserId, circleId: fx.circleId, role: 'owner' })}`;

const get = (path: string) =>
  handleCircleGet(db, new Request(`${origin}/c/${slug}${path}`, { headers: { cookie: cookie() } }), slug);

const post = (path: string, fields: Record<string, string>) =>
  handleCirclePost(
    db,
    new Request(`${origin}/c/${slug}${path}`, {
      method: 'POST',
      headers: {
        cookie: cookie(),
        origin,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(fields).toString(),
    }),
    slug,
  );

it('lists unlinked registry wishes and links them hidden until preview+show', async () => {
  const actor = { role: 'owner' as const, userId: fx.ownerUserId, circleId: fx.circleId };
  const item = await db.withActor(actor, (tx) =>
    createRegistryItem(tx, actor, { title: 'Picker wish', priceMinor: 1200, currency: 'USD' }),
  );

  const empty = await get('/registry');
  expect(empty.status).toBe(200);
  expect(await empty.text()).toContain('Picker wish');

  const linked = await post('/registry', { intent: 'link', registryItemId: item.id });
  expect(linked.status).toBe(303);
  expect(linked.headers.get('Location')).toBe(`/c/${slug}/registry?linked=1`);

  const afterLink = await get('/registry?linked=1');
  const afterBody = await afterLink.text();
  expect(afterBody).toContain('Hidden here');
  expect(afterBody).toContain('Added from your registry');

  const showTooSoon = await post('/registry', { intent: 'show', registryItemId: item.id });
  expect(showTooSoon.status).toBe(422);
  expect(await showTooSoon.text()).toContain('Preview this circle before showing');

  const preview = await post('/registry', { intent: 'preview' });
  expect(preview.status).toBe(303);
  expect(preview.headers.get('Location')).toBe(`/c/${slug}/registry/preview`);

  const previewPage = await get('/registry/preview');
  expect(previewPage.status).toBe(200);
  expect(await previewPage.text()).toContain('Ready to show');

  const shown = await post('/registry', { intent: 'show', registryItemId: item.id });
  expect(shown.status).toBe(303);
  const sharing = await get('/registry');
  expect(await sharing.text()).toContain('Shown here');
});

it('404s the sharing surface for friends', async () => {
  const friendCookie = `${SESSION_COOKIE}=${issueSession({
    userId: fx.friendAUserId, circleId: fx.circleId, role: 'friend',
  })}`;
  const res = await handleCircleGet(
    db,
    new Request(`${origin}/c/${slug}/registry`, { headers: { cookie: friendCookie } }),
    slug,
  );
  expect(res.status).toBe(404);
});
