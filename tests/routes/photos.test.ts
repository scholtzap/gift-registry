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

function postDeps(path: string, form: FormData, role: 'owner' | 'friend', deps?: unknown) {
  return routes.handleCirclePost(fx.db, new Request(`${origin}/c/${slug}${path}`, {
    method: 'POST', headers: { cookie: cookie(role), origin }, body: form,
  }), slug, deps as never);
}
async function plainPng(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: '#246b5b' } }).png().toBuffer();
}

describe('photo add/replace on an existing item (3b)', () => {
  it('lets the owner replace a wish photo and deletes the old file', async () => {
    const form = new FormData();
    form.set('intent', 'set_photo');
    form.set('photo', new Blob([new Uint8Array(await plainPng())], { type: 'image/png' }), 'wish.png');
    expect((await postForm(`/items/${fx.itemOwnId}/photo`, form, 'owner')).status).toBe(303);
    const first = await fx.db.prisma.item.findUniqueOrThrow({ where: { id: fx.itemOwnId } });
    expect(first.imagePath).toMatch(/^photos\//);
    const form2 = new FormData();
    form2.set('intent', 'set_photo');
    form2.set('photo', new Blob([new Uint8Array(await plainPng())], { type: 'image/png' }), 'wish2.png');
    expect((await postForm(`/items/${fx.itemOwnId}/photo`, form2, 'owner')).status).toBe(303);
    const second = await fx.db.prisma.item.findUniqueOrThrow({ where: { id: fx.itemOwnId } });
    expect(second.imagePath).not.toBe(first.imagePath);
    await expect(readFile(join(mediaDir, first.imagePath!))).rejects.toThrow();
    expect((await get(`/items/${fx.itemOwnId}/photo`, 'owner')).status).toBe(200);
  });

  it('lets a friend replace a photo only on their own idea', async () => {
    const form = new FormData();
    form.set('intent', 'set_photo');
    form.set('photo', new Blob([new Uint8Array(await plainPng())], { type: 'image/png' }), 'idea.png');
    // itemSecretId is friend A's idea; friend B (same cookie helper is friendA, so use owner as the other actor) cannot.
    expect((await postForm(`/items/${fx.itemSecretId}/photo`, form, 'owner')).status).toBe(404);
    expect((await postForm(`/items/${fx.itemSecretId}/photo`, form, 'friend')).status).toBe(303);
    expect((await get(`/items/${fx.itemSecretId}/photo`, 'friend')).status).toBe(200);
    expect((await get(`/items/${fx.itemSecretId}/photo`, 'owner')).status).toBe(404);
  });
});

describe('WhatsApp intake photo carry (3a)', () => {
  async function seedImageDraft(title: string) {
    const { storeMedia } = await import('@/server/wa/store');
    const png = await plainPng();
    const ingest = await fx.db.prisma.ingestEvent.create({ data: {
      waMessageId: `wamid.fictional-${crypto.randomUUID()}`, circleId: fx.circleId, userId: fx.friendAUserId,
      kind: 'image', status: 'parsed',
      draft: { version: 1, candidates: [{ index: 0, state: 'pending', title, brand: null, priceMinor: 5000, currency: 'USD', imagePath: 'ingest-source' }] },
    } });
    await storeMedia(mediaDir, ingest.id, png);
    return ingest;
  }
  function confirmForm(ingestId: string, title: string) {
    const form = new FormData();
    form.set('intent', 'confirm'); form.set('title', title); form.set('retailer', '');
    form.set('currency', 'USD'); form.set('priceAmount', '50'); form.set('ingestEventId', ingestId);
    return form;
  }
  it('carries a clean intake photo onto the confirmed item, re-encoded', async () => {
    const ingest = await seedImageDraft('Fictional intake lamp');
    const deps = { visionServices: { mode: 'demo' as const, detectPeople: async () => ({ width: 64, height: 48, boxes: [] }), segment: async () => [] } };
    expect((await postDeps('/draft', confirmForm(ingest.id, 'Fictional intake lamp'), 'friend', deps)).status).toBe(303);
    const item = await fx.db.prisma.item.findFirstOrThrow({ where: { circleId: fx.circleId, title: 'Fictional intake lamp' } });
    expect(item.imagePath).toMatch(/^photos\/[0-9a-f-]{36}\.webp$/);
    expect((await get(`/items/${item.id}/photo`, 'friend')).status).toBe(200);
  });
  it('drops the intake photo when a person is in frame, and still confirms the item', async () => {
    const ingest = await seedImageDraft('Fictional person lamp');
    const deps = { visionServices: { mode: 'demo' as const, detectPeople: async () => ({ width: 64, height: 48, boxes: [{ x: 0, y: 0, width: 10, height: 10 }] }), segment: async () => [] } };
    expect((await postDeps('/draft', confirmForm(ingest.id, 'Fictional person lamp'), 'friend', deps)).status).toBe(303);
    const item = await fx.db.prisma.item.findFirstOrThrow({ where: { circleId: fx.circleId, title: 'Fictional person lamp' } });
    expect(item.imagePath).toBeNull();
  });
  it('drops the intake photo when no person detector is configured', async () => {
    const ingest = await seedImageDraft('Fictional unguarded lamp');
    expect((await postDeps('/draft', confirmForm(ingest.id, 'Fictional unguarded lamp'), 'friend', undefined)).status).toBe(303);
    const item = await fx.db.prisma.item.findFirstOrThrow({ where: { circleId: fx.circleId, title: 'Fictional unguarded lamp' } });
    expect(item.imagePath).toBeNull();
  });
});
