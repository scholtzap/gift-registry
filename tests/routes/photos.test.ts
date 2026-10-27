import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CircleFixture } from '../leak/fixtures';

// Product photos: stored without metadata, served only through the viewer's own projection.
let fx: CircleFixture;
let slug: string;
let mediaDir: string;
let routes: typeof import('@/server/routes/circle');
let session: typeof import('@/server/auth/session');
let origin: string;

beforeAll(async () => {
  mediaDir = await mkdtemp(join(tmpdir(), 'pinata-photos-'));
  vi.stubEnv('MEDIA_DIR', mediaDir);
  const { seedCircle } = await import('../leak/fixtures');
  fx = await seedCircle(process.env.DATABASE_URL_TEST!);
  slug = (await fx.db.prisma.circle.findUniqueOrThrow({ where: { id: fx.circleId } })).shareSlug;
  routes = await import('@/server/routes/circle');
  session = await import('@/server/auth/session');
  origin = new URL((await import('@/lib/env')).env.CIRCLE_BASE_URL).origin;
});
afterAll(async () => {
  await fx?.db.disconnect();
  vi.unstubAllEnvs();
  await rm(mediaDir, { recursive: true, force: true });
});

function cookie(role: 'owner' | 'friend') {
  const userId = role === 'owner' ? fx.ownerUserId : fx.friendAUserId;
  return `${session.SESSION_COOKIE}=${session.issueSession({ role, userId, circleId: fx.circleId })}`;
}
function get(path: string, role: 'owner' | 'friend') {
  return routes.handleCircleGet(fx.db, new Request(`${origin}/c/${slug}${path}`, { headers: { cookie: cookie(role) } }), slug);
}
function postForm(path: string, form: FormData, role: 'owner' | 'friend') {
  return routes.handleCirclePost(fx.db, new Request(`${origin}/c/${slug}${path}`, {
    method: 'POST', headers: { cookie: cookie(role), origin }, body: form,
  }), slug);
}
async function photoWithExif(): Promise<Blob> {
  const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#e4572e' } })
    .jpeg().withMetadata({ exif: { IFD0: { Make: 'FictionalCam', Copyright: 'Fictional owner' } } }).toBuffer();
  expect((await sharp(png).metadata()).exif).toBeDefined();
  return new Blob([new Uint8Array(png)], { type: 'image/jpeg' });
}
function draftForm(title: string, photo?: Blob, name = 'gift.jpg') {
  const form = new FormData();
  form.set('intent', 'confirm');
  form.set('title', title);
  form.set('retailer', '');
  form.set('currency', 'USD');
  form.set('priceAmount', '$1,249.50');
  if (photo) form.set('photo', photo, name);
  return form;
}

describe('product photos', () => {
  it('stores a friend upload without metadata and hides it from the owner', async () => {
    const response = await postForm('/draft', draftForm('Fictional photographed lamp', await photoWithExif()), 'friend');
    expect(response.status).toBe(303);
    const item = await fx.db.prisma.item.findFirstOrThrow({ where: { circleId: fx.circleId, title: 'Fictional photographed lamp' } });
    expect(item).toMatchObject({ visibility: 'friend_only', currency: 'USD', priceMinor: 124950 });
    expect(item.imagePath).toMatch(/^photos\/[0-9a-f-]{36}\.webp$/);

    const stored = await readFile(join(mediaDir, item.imagePath!));
    const meta = await sharp(stored).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(stored.includes(Buffer.from('FictionalCam'))).toBe(false);

    const friend = await get(`/items/${item.id}/photo`, 'friend');
    expect(friend.status).toBe(200);
    expect(friend.headers.get('content-type')).toBe('image/webp');
    expect(friend.headers.get('cache-control')).toContain('no-store');

    // The owner gets the same 404 as for an item that does not exist.
    const owner = await get(`/items/${item.id}/photo`, 'owner');
    expect(owner.status).toBe(404);
    const missing = await get(`/items/${crypto.randomUUID()}/photo`, 'owner');
    expect(await owner.text()).toBe(await missing.text());
  });

  it('shows an owner photo to the owner and to friends', async () => {
    expect((await postForm('/draft', draftForm('Fictional owner kettle', await photoWithExif()), 'owner')).status).toBe(303);
    const item = await fx.db.prisma.item.findFirstOrThrow({ where: { circleId: fx.circleId, title: 'Fictional owner kettle' } });
    expect((await get(`/items/${item.id}/photo`, 'owner')).status).toBe(200);
    expect((await get(`/items/${item.id}/photo`, 'friend')).status).toBe(200);
    expect(await (await get(`/items/${item.id}`, 'owner')).text()).toContain(`/items/${item.id}/photo`);
  });

  it('refuses a file that is not a photo and adds nothing', async () => {
    const response = await postForm('/draft', draftForm('Fictional not-a-photo', new Blob(['hello'], { type: 'text/plain' }), 'note.txt'), 'friend');
    expect(response.status).toBe(422);
    expect(await response.text()).toContain('Use a JPEG, PNG or WebP photo under 5 MB');
    expect(await fx.db.prisma.item.count({ where: { circleId: fx.circleId, title: 'Fictional not-a-photo' } })).toBe(0);
  });

  it('accepts multipart only on the add-item form', async () => {
    const form = new FormData();
    form.set('intent', 'claim');
    expect((await postForm(`/items/${fx.itemOwnId}`, form, 'friend')).status).toBe(404);
  });

  it('serves no photo for an item without one', async () => {
    expect((await get(`/items/${fx.itemOwnId}/photo`, 'friend')).status).toBe(404);
  });
});
