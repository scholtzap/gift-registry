import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, rm, writeFile, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Actor } from '@/server/db/client';
import { CapabilityOffError, setCapability } from '@/server/entitlements';
import { seedCircle, type CircleFixture } from '../leak/fixtures';
import { createCutoutExtractor, type VisionServices } from '@/server/vision';
import sharp from 'sharp';
import { syntheticPhoto, mask, RIGHT_GIFT, PERSON } from '../fixtures/vision/synthetic';

let fx: CircleFixture;
let actor: Actor;
let mediaDir: string;

beforeAll(async () => {
  fx = await seedCircle(process.env.DATABASE_URL_TEST!);
  actor = { role: 'friend', userId: fx.friendAUserId, circleId: fx.circleId };
});
afterAll(async () => { await fx?.db.disconnect(); });
beforeEach(async () => {
  mediaDir = await mkdtemp(join(tmpdir(), 'pinata-vision-'));
  await fx.db.withActor(actor, (tx) => setCapability(tx, actor, 'photo_extract', true));
});
afterEach(async () => { await rm(mediaDir, { recursive: true, force: true }); });

function services(): VisionServices {
  return {
    mode: 'live',
    detectPeople: vi.fn(async () => ({ width: 12, height: 8, boxes: [] })),
    segment: vi.fn(async () => []),
  };
}

describe('public vision extraction boundary', () => {
  it('refuses before any external call or media read when photo_extract is off', async () => {
    await fx.db.withActor(actor, (tx) => setCapability(tx, actor, 'photo_extract', false));
    const external = services();
    const extract = createCutoutExtractor({ mediaDir, sourceId: 'owned-photo', services: external });
    await expect(extract(fx.db, actor, join(mediaDir, 'missing.png'))).rejects.toThrow(CapabilityOffError);
    expect(external.detectPeople).not.toHaveBeenCalled();
    expect(external.segment).not.toHaveBeenCalled();
    expect(await readdir(mediaDir)).toEqual([]);
  });

  it('produces two real PNG draft cutouts, scoped to a friend, after the person precheck', async () => {
    const imagePath = join(mediaDir, 'source.png');
    await writeFile(imagePath, await syntheticPhoto());
    const order: string[] = [];
    const external = services();
    external.detectPeople = vi.fn(async () => {
      order.push('people');
      expect(await readdir(mediaDir)).toEqual(['source.png']);
      return { width: 12, height: 8, boxes: [] };
    });
    external.segment = vi.fn(async () => { order.push('sam'); return [mask(RIGHT_GIFT), mask()]; });
    const result = await createCutoutExtractor({ mediaDir, sourceId: 'owned-photo', services: external })(fx.db, actor, imagePath);
    expect(order).toEqual(['people', 'sam']);
    expect(result.visibility).toBe('friend_only');
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({ state: 'pending', area: 12 });
    expect(result.candidates[1]).toMatchObject({ state: 'pending', area: 8 });
    const first = await sharp(await readFile(join(mediaDir, result.candidates[0]!.imagePath))).raw().toBuffer({ resolveWithObject: true });
    expect(first.info).toMatchObject({ width: 3, height: 4, channels: 4 });
    expect([...first.data.subarray(0, 4)]).toEqual([220, 20, 60, 255]);
  });

  it('stores nothing for a mask intersecting the detected PERSON box, including a hand beside a gift', async () => {
    const imagePath = join(mediaDir, 'person.png');
    await writeFile(imagePath, await syntheticPhoto(true));
    const external = services();
    external.detectPeople = vi.fn(async () => ({ width: 12, height: 8, boxes: [PERSON] }));
    external.segment = vi.fn(async () => [mask({ x: 5, y: 2, width: 4, height: 4 }), mask(PERSON)]);
    const result = await createCutoutExtractor({ mediaDir, sourceId: 'person-photo', services: external })(fx.db, actor, imagePath);
    expect(result.candidates).toEqual([]);
    expect(result.rejectedPersonMasks).toBe(2);
    expect(await readdir(mediaDir)).toEqual(['person.png']);
  });

  it.each([
    ['missing people', null],
    ['wrong coordinate frame', { width: 120, height: 80, boxes: [] }],
    ['nonfinite box', { width: 12, height: 8, boxes: [{ ...PERSON, x: NaN }] }],
    ['out of bounds box', { width: 12, height: 8, boxes: [{ ...PERSON, width: 20 }] }],
    ['zero width hand', { width: 12, height: 8, boxes: [{ ...PERSON, width: 0 }] }],
  ])('rejects %s person data BEFORE calling SAM or storing any mask', async (_label, people) => {
    const imagePath = join(mediaDir, 'source.png');
    await writeFile(imagePath, await syntheticPhoto(true));
    const external = services();
    external.detectPeople = vi.fn(async () => people);
    await expect(createCutoutExtractor({ mediaDir, sourceId: 'bad-people', services: external })(fx.db, actor, imagePath))
      .rejects.toMatchObject({ code: 'invalid_people' });
    expect(external.segment).not.toHaveBeenCalled();
    expect(await readdir(mediaDir)).toEqual(['source.png']);
  });

  it.each([
    ['wrong dimensions', () => ({ ...mask(), width: 6 })],
    ['short raster', () => ({ ...mask(), pixels: new Uint8Array(2) })],
    ['non-binary raster', () => { const m = mask(); m.pixels[25] = 255; return m; }],
    ['negative box', () => ({ ...mask(), box: { x: -1, y: 2, width: 3, height: 4 } })],
    ['oversized box', () => ({ ...mask(), box: { x: 1, y: 2, width: 99, height: 4 } })],
    ['fractional box', () => ({ ...mask(), box: { x: 1.2, y: 2, width: 3, height: 4 } })],
    ['hidden person pixels outside claimed gift box', () => { const m = mask(); m.pixels[20] = 1; return m; }],
    ['model-selected storage path', () => ({ imagePath: '../../outside.png' })],
  ])('validates the entire SAM batch before storage: %s', async (_label, malformedMask) => {
    const imagePath = join(mediaDir, 'source.png');
    await writeFile(imagePath, await syntheticPhoto(true));
    const external = services();
    external.segment = vi.fn(async () => [mask(), malformedMask()]);
    await expect(createCutoutExtractor({ mediaDir, sourceId: 'bad-masks', services: external })(fx.db, actor, imagePath))
      .rejects.toMatchObject({ code: 'invalid_mask' });
    expect(await readdir(mediaDir)).toEqual(['source.png']);
  });

  it('cannot read a sibling path or a directory-junction escape from bounded media', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'pinata-vision-outside-'));
    try {
      await writeFile(join(outside, 'source.png'), await syntheticPhoto());
      await symlink(outside, join(mediaDir, 'escape'), 'junction');
      const external = services();
      const extract = createCutoutExtractor({ mediaDir, sourceId: 'traversal', services: external });
      for (const path of [join(outside, 'source.png'), join(mediaDir, 'escape', 'source.png')]) {
        await expect(extract(fx.db, actor, path)).rejects.toMatchObject({ code: 'unsafe_media_path' });
      }
      expect(external.detectPeople).not.toHaveBeenCalled();
      expect(external.segment).not.toHaveBeenCalled();
    } finally { await rm(outside, { recursive: true, force: true }); }
  });

  it('cannot write cutouts through a directory junction outside bounded media', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'pinata-vision-outside-'));
    try {
      const imagePath = join(mediaDir, 'source.png');
      await writeFile(imagePath, await syntheticPhoto());
      await symlink(outside, join(mediaDir, 'cutouts'), 'junction');
      const external = services();
      external.segment = vi.fn(async () => [mask()]);
      await expect(createCutoutExtractor({ mediaDir, sourceId: 'output-escape', services: external })(fx.db, actor, imagePath))
        .rejects.toMatchObject({ code: 'unsafe_media_path' });
      expect(await readdir(outside)).toEqual([]);
    } finally { await rm(outside, { recursive: true, force: true }); }
  });

  it.each([
    ['oversized file', async () => Buffer.alloc(5_000_001), 'image_too_large'],
    ['invalid bytes', async () => Buffer.from('not an image'), 'invalid_image'],
    ['decompression dimensions', async () => sharp({ create: { width: 8193, height: 1, channels: 3, background: '#fff' } }).png().toBuffer(), 'image_too_large'],
    ['vector image', async () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="8"><rect width="12" height="8"/></svg>'), 'invalid_image'],
  ])('rejects %s before external calls', async (_label, bytes, code) => {
    const imagePath = join(mediaDir, 'source.png');
    await writeFile(imagePath, await bytes());
    const external = services();
    await expect(createCutoutExtractor({ mediaDir, sourceId: 'bad-input', services: external })(fx.db, actor, imagePath))
      .rejects.toMatchObject({ code });
    expect(external.detectPeople).not.toHaveBeenCalled();
    expect(external.segment).not.toHaveBeenCalled();
    expect(await readdir(mediaDir)).toEqual(['source.png']);
  });

  it.each(['people', 'sam'])('honours consent revoked during %s before the next spend or any storage', async (stage) => {
    const imagePath = join(mediaDir, 'source.png');
    await writeFile(imagePath, await syntheticPhoto());
    const external = services();
    const revoke = () => fx.db.withActor(actor, (tx) => setCapability(tx, actor, 'photo_extract', false));
    if (stage === 'people') {
      external.detectPeople = vi.fn(async () => { await revoke(); return { width: 12, height: 8, boxes: [] }; });
    } else {
      external.segment = vi.fn(async () => { await revoke(); return [mask()]; });
    }
    await expect(createCutoutExtractor({ mediaDir, sourceId: 'revoked', services: external })(fx.db, actor, imagePath))
      .rejects.toThrow(CapabilityOffError);
    if (stage === 'people') expect(external.segment).not.toHaveBeenCalled();
    expect(await readdir(mediaDir)).toEqual(['source.png']);
  });

  it('default live adapter fails closed rather than inventing a SAM response', async () => {
    const imagePath = join(mediaDir, 'source.png');
    await writeFile(imagePath, await syntheticPhoto());
    await expect(createCutoutExtractor({ mediaDir, sourceId: 'unsupported' })(fx.db, actor, imagePath))
      .rejects.toMatchObject({ code: 'live_protocol_unverified' });
    expect(await readdir(mediaDir)).toEqual(['source.png']);
  });

  it('only uses fixture services with explicit DEMO_MODE=true', async () => {
    const imagePath = join(mediaDir, 'source.png');
    await writeFile(imagePath, await syntheticPhoto());
    const external = services();
    external.mode = 'demo';
    external.segment = vi.fn(async () => [mask()]);
    await expect(createCutoutExtractor({ mediaDir, sourceId: 'demo', services: external })(fx.db, actor, imagePath))
      .rejects.toMatchObject({ code: 'demo_mode_required' });
    expect(external.detectPeople).not.toHaveBeenCalled();
    expect(external.segment).not.toHaveBeenCalled();
    const result = await createCutoutExtractor({ mediaDir, sourceId: 'demo', services: external, DEMO_MODE: true })(fx.db, actor, imagePath);
    expect(result.candidates).toHaveLength(1);
    expect(result.executionMode).toBe('demo');
  });

  it.each(['people', 'sam'])('does not leak %s service errors or silently substitute fixture output', async (stage) => {
    const imagePath = join(mediaDir, 'source.png');
    await writeFile(imagePath, await syntheticPhoto());
    const external = services();
    const fail = vi.fn(async () => { throw new Error('upstream-private-response'); });
    if (stage === 'people') external.detectPeople = fail;
    else external.segment = fail;
    const error = await createCutoutExtractor({ mediaDir, sourceId: 'outage', services: external })(fx.db, actor, imagePath).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: stage === 'people' ? 'person_detection_failed' : 'segmentation_failed' });
    expect(String(error)).not.toContain('upstream-private-response');
    expect(error).not.toHaveProperty('cause');
    expect(await readdir(mediaDir)).toEqual(['source.png']);
  });

  it('never lets an external provider mutate the source sent to SAM or the composited pixels', async () => {
    const imagePath = join(mediaDir, 'source.png');
    await writeFile(imagePath, await syntheticPhoto());
    const external = services();
    external.detectPeople = vi.fn(async (image) => {
      image.bytes.fill(0);
      return { width: 12, height: 8, boxes: [] };
    });
    external.segment = vi.fn(async (image) => {
      expect([...image.bytes.subarray(0, 4)]).toEqual([137, 80, 78, 71]);
      image.bytes.fill(0);
      return [mask()];
    });
    const result = await createCutoutExtractor({ mediaDir, sourceId: 'immutable-input', services: external })(fx.db, actor, imagePath);
    const pixels = await sharp(await readFile(join(mediaDir, result.candidates[0]!.imagePath))).raw().toBuffer();
    expect([...pixels.subarray(0, 4)]).toEqual([220, 20, 60, 255]);
  });

  it('drops empty/tiny masks, ranks by occupied area, and caps at six pending drafts', async () => {
    const imagePath = join(mediaDir, 'source.png');
    await writeFile(imagePath, await syntheticPhoto());
    const external = services();
    external.segment = vi.fn(async () => [0, 3, 5, 7, 6, 10, 8, 9, 11, 12].map((area) => {
      const m = mask();
      let retained = 0;
      for (let i = 0; i < m.pixels.length; i++) if (m.pixels[i] === 1 && retained++ >= area) m.pixels[i] = 0;
      return m;
    }));
    const result = await createCutoutExtractor({ mediaDir, sourceId: 'ranked', services: external })(fx.db, actor, imagePath);
    expect(result.candidates.map((c) => c.area)).toEqual([12, 11, 10, 9, 8, 7]);
    expect(result.candidates.every((c) => c.state === 'pending')).toBe(true);
  });

  it('reuses identical PNG bytes on retry but does not reuse a cutout for a different source image', async () => {
    const imagePath = join(mediaDir, 'source.png');
    await writeFile(imagePath, await syntheticPhoto());
    const external = services();
    external.segment = vi.fn(async () => [mask()]);
    const extract = createCutoutExtractor({ mediaDir, sourceId: '../../opaque-message-id', services: external });
    const first = await extract(fx.db, actor, imagePath);
    const second = await extract(fx.db, actor, imagePath);
    expect(second).toEqual(first);
    await writeFile(imagePath, await syntheticPhoto(false, 1));
    const different = await extract(fx.db, actor, imagePath);
    expect(different.candidates[0]!.imagePath).not.toBe(first.candidates[0]!.imagePath);
    expect(first.candidates[0]!.imagePath).toMatch(/^cutouts\/[a-f0-9]{64}\/0\.png$/);
  });

  it('stores no PNG for a batch containing only empty and below-minimum masks', async () => {
    const imagePath = join(mediaDir, 'source.png');
    await writeFile(imagePath, await syntheticPhoto());
    const external = services();
    external.segment = vi.fn(async () => [mask({ x: 1, y: 2, width: 1, height: 3 }), { ...mask(), pixels: new Uint8Array(96) }]);
    const result = await createCutoutExtractor({ mediaDir, sourceId: 'tiny', services: external })(fx.db, actor, imagePath);
    expect(result.candidates).toEqual([]);
    expect(await readdir(mediaDir)).toEqual(['source.png']);
  });

  it('rounds fractional person boxes outward and discards the whole touching mask conservatively', async () => {
    const imagePath = join(mediaDir, 'source.png');
    await writeFile(imagePath, await syntheticPhoto(true));
    const external = services();
    external.detectPeople = vi.fn(async () => ({ width: 12, height: 8, boxes: [{ x: 6.99, y: 2.2, width: 0.01, height: 0.1 }] }));
    external.segment = vi.fn(async () => [mask(RIGHT_GIFT)]);
    const result = await createCutoutExtractor({ mediaDir, sourceId: 'fractional-person', services: external })(fx.db, actor, imagePath);
    expect(result.candidates).toEqual([]);
    expect(result.rejectedPersonMasks).toBe(1);
    expect(await readdir(mediaDir)).toEqual(['source.png']);
  });

  it('never overwrites a conflicting previously stored PNG', async () => {
    const imagePath = join(mediaDir, 'source.png');
    await writeFile(imagePath, await syntheticPhoto());
    const external = services();
    external.segment = vi.fn(async () => [mask()]);
    const extract = createCutoutExtractor({ mediaDir, sourceId: 'conflict', services: external });
    const first = await extract(fx.db, actor, imagePath);
    const cutout = join(mediaDir, first.candidates[0]!.imagePath);
    await writeFile(cutout, Buffer.from('conflicting bytes'));
    await expect(extract(fx.db, actor, imagePath)).rejects.toMatchObject({ code: 'cutout_conflict' });
    expect(await readFile(cutout, 'utf8')).toBe('conflicting bytes');
  });

  it.each(Array.from({ length: 10 }, (_, n) => n))('runs owned synthetic PNG fixture %i through the public pipeline', async (variant) => {
    const withPerson = variant >= 8;
    const imagePath = join(mediaDir, `synthetic-${variant}.png`);
    await writeFile(imagePath, await syntheticPhoto(withPerson, variant));
    const external = services();
    external.detectPeople = vi.fn(async () => ({ width: 12, height: 8, boxes: withPerson ? [PERSON] : [] }));
    external.segment = vi.fn(async () => withPerson ? [mask(PERSON)] : [mask(), mask(RIGHT_GIFT)]);
    const result = await createCutoutExtractor({ mediaDir, sourceId: `fixture-${variant}`, services: external })(fx.db, actor, imagePath);
    expect(result.candidates).toHaveLength(withPerson ? 0 : 2);
    if (withPerson) expect(await readdir(mediaDir)).toEqual([`synthetic-${variant}.png`]);
    else {
      const png = await sharp(await readFile(join(mediaDir, result.candidates[0]!.imagePath))).raw().toBuffer();
      expect([...png.subarray(0, 4)]).toEqual([220, 20, 60, 255]);
    }
  });
});
