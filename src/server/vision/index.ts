import type { Actor, Db } from '@/server/db/client';
import { assertCan } from '@/server/entitlements';
import { link, lstat, mkdir, open, readdir, realpath, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import sharp from 'sharp';

export interface PixelBox { x: number; y: number; width: number; height: number }
export interface RasterMask { width: number; height: number; box: PixelBox; pixels: Uint8Array }
export interface VisionImage { readonly bytes: Buffer; readonly width: number; readonly height: number }
export interface PersonDetection { width: number; height: number; boxes: PixelBox[] }

export class VisionError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'VisionError'; }
}

/** Outputs are untrusted; providers must map their verified protocol into source-pixel coordinates. */
export interface VisionServices {
  mode: 'live' | 'demo';
  detectPeople: (image: VisionImage) => Promise<unknown>;
  segment: (image: VisionImage) => Promise<unknown>;
}
export interface CutoutCandidate {
  state: 'pending';
  title: string;
  imagePath: string;
  area: number;
}
export interface CutoutResult {
  visibility: 'owner_visible' | 'friend_only';
  executionMode: 'live' | 'demo';
  candidates: CutoutCandidate[];
  rejectedPersonMasks: number;
}

export function createCutoutExtractor(options: {
  mediaDir: string;
  sourceId: string;
  services?: VisionServices;
  DEMO_MODE?: boolean;
}) {
  return async (db: Db, actor: Actor, imagePath: string): Promise<CutoutResult> => {
    await db.withActor(actor, (tx) => assertCan(tx, actor, 'photo_extract'));
    if (!options.services) throw new VisionError('live_protocol_unverified');
    if (options.services.mode === 'demo' && options.DEMO_MODE !== true) throw new VisionError('demo_mode_required');
    const root = await mediaRoot(options.mediaDir);
    const image = await decodeImage(await readBoundedMedia(root, imagePath));
    const bytes = image.bytes;
    await db.withActor(actor, (tx) => assertCan(tx, actor, 'photo_extract'));
    const people = validatePeople(await callExternal(options.services.detectPeople, image, 'person_detection_failed'), image);
    await db.withActor(actor, (tx) => assertCan(tx, actor, 'photo_extract'));
    const rawMasks = await callExternal(options.services.segment, image, 'segmentation_failed');
    await db.withActor(actor, (tx) => assertCan(tx, actor, 'photo_extract'));
    if (!Array.isArray(rawMasks) || rawMasks.length > 32 || rawMasks.length * image.width * image.height > 64_000_000) {
      throw new VisionError('invalid_mask');
    }
    const masks = rawMasks.map((raw) => validateMask(raw, image));
    const safe = masks.filter((mask) => !people.boxes.some((person) => intersects(mask.box, person)));
    const minimumArea = Math.max(4, Math.ceil(image.width * image.height * 0.001));
    const ranked = safe.map((mask) => ({ mask, area: mask.pixels.reduce((n, bit) => n + bit, 0) }))
      .filter((entry) => entry.area >= minimumArea).sort((a, b) => b.area - a.area).slice(0, 6);
    const imageDigest = createHash('sha256').update(bytes).digest('hex');
    const scope = createHash('sha256').update(JSON.stringify([actor.userId, actor.circleId, options.sourceId, imageDigest])).digest('hex');
    const directory = join(root, 'cutouts', scope);
    const candidates: CutoutCandidate[] = [];
    for (const [index, entry] of ranked.entries()) {
      const png = await renderMaskedCutout(bytes, entry.mask, people.boxes);
      await checkMediaPath(root, directory, true);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const imagePath = `cutouts/${scope}/${index}.png`;
      await writeBoundedMedia(root, join(root, imagePath), png);
      candidates.push({ state: 'pending', title: `Gift candidate ${index + 1}`, imagePath, area: entry.area });
    }
    return { visibility: actor.role === 'friend' ? 'friend_only' : 'owner_visible', executionMode: options.services.mode, candidates, rejectedPersonMasks: masks.length - safe.length };
  };
}

async function callExternal(service: VisionServices['detectPeople'], image: VisionImage, code: string): Promise<unknown> {
  try { return await service(Object.freeze({ ...image, bytes: Buffer.from(image.bytes) })); }
  catch { throw new VisionError(code); }
}

export const VISION_LIMITS = Object.freeze({ imageBytes: 5_000_000, imagePixels: 16_000_000, dimension: 8192 });

async function decodeImage(input: Buffer): Promise<VisionImage> {
  if (!Buffer.isBuffer(input) || input.length === 0) throw new VisionError('invalid_image');
  if (input.length > VISION_LIMITS.imageBytes) throw new VisionError('image_too_large');
  try {
    // Read metadata first, then bound the full decode. Vectors/animation are not photo intake.
    const metadata = await sharp(input, { limitInputPixels: false }).metadata();
    if (!['png', 'jpeg'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1) throw new VisionError('invalid_image');
    if (!metadata.width || !metadata.height) throw new VisionError('invalid_image');
    if (metadata.width > VISION_LIMITS.dimension || metadata.height > VISION_LIMITS.dimension || metadata.width * metadata.height > VISION_LIMITS.imagePixels) {
      throw new VisionError('image_too_large');
    }
    const { data, info } = await sharp(input, { limitInputPixels: VISION_LIMITS.imagePixels, failOn: 'warning' })
      .autoOrient().toColourspace('srgb').png().toBuffer({ resolveWithObject: true });
    if (data.length > VISION_LIMITS.imageBytes) throw new VisionError('image_too_large');
    return { bytes: data, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof VisionError) throw error;
    throw new VisionError('invalid_image');
  }
}

async function mediaRoot(directory: string): Promise<string> {
  if (!isAbsolute(directory) || (await lstat(directory)).isSymbolicLink()) throw new VisionError('unsafe_media_path');
  return realpath(directory);
}

async function checkMediaPath(root: string, path: string, allowMissing = false): Promise<void> {
  if (!isAbsolute(path) || path.split(/[\\/]/).includes('..')) throw new VisionError('unsafe_media_path');
  const rel = relative(root, resolve(path));
  if (!rel || isAbsolute(rel) || rel.startsWith('..') || rel.split(/[\\/]/).some((part) => /[:*?\0]/.test(part))) {
    throw new VisionError('unsafe_media_path');
  }
  let current = root;
  for (const part of rel.split(/[\\/]/)) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new VisionError('unsafe_media_path');
    } catch (error) {
      if (allowMissing && isRecord(error) && error.code === 'ENOENT') return;
      throw error;
    }
  }
  const canonical = relative(root, await realpath(path));
  if (isAbsolute(canonical) || canonical.startsWith('..')) throw new VisionError('unsafe_media_path');
}

async function readBoundedMedia(root: string, path: string, publishedCutout = false): Promise<Buffer> {
  await checkMediaPath(root, path);
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await file.stat();
    if (!stat.isFile() || (stat.nlink !== 1 && (!publishedCutout || !(await hasPublicationLink(file, path))))) {
      throw new VisionError('unsafe_media_path');
    }
    if (stat.size > VISION_LIMITS.imageBytes) throw new VisionError('image_too_large');
    const buffer = Buffer.alloc(VISION_LIMITS.imageBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > VISION_LIMITS.imageBytes) throw new VisionError('image_too_large');
    return buffer.subarray(0, length);
  } finally { await file.close(); }
}

async function hasPublicationLink(file: FileHandle, path: string): Promise<boolean> {
  const stat = await file.stat();
  if (stat.nlink === 1) return true;
  if (stat.nlink !== 2) return false;
  // A winner may be between link() and unlink(); do not relax source hard-link checks.
  const prefix = `.${basename(path)}.`;
  for (const name of await readdir(dirname(path))) {
    if (!name.startsWith(prefix) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.tmp$/.test(name.slice(prefix.length))) continue;
    try {
      const temp = await lstat(join(dirname(path), name));
      if (temp.isFile() && temp.dev === stat.dev && temp.ino === stat.ino && temp.nlink === 2) return true;
    } catch (error) {
      if (!isRecord(error) || error.code !== 'ENOENT') throw error;
    }
  }
  // Cleanup can finish while the directory is being inspected.
  return (await file.stat()).nlink === 1;
}

async function writeBoundedMedia(root: string, path: string, png: Buffer): Promise<void> {
  await checkMediaPath(root, path, true);
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  const file = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    try { await file.writeFile(png); } finally { await file.close(); }
    await checkMediaPath(root, path, true);
    try {
      // Same-directory hard linking publishes only completed bytes, without replacing a final.
      await link(temp, path);
    } catch (error) {
      if (!isRecord(error) || error.code !== 'EEXIST') throw error;
      if (!(await readBoundedMedia(root, path, true)).equals(png)) throw new VisionError('cutout_conflict');
    }
  } finally { await unlink(temp); }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateBox(raw: unknown, image: { width: number; height: number }, code: string, integer = false): PixelBox {
  if (!isRecord(raw)) throw new VisionError(code);
  const { x, y, width, height } = raw;
  if (![x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n) && (!integer || Number.isInteger(n)))) {
    throw new VisionError(code);
  }
  const box = { x, y, width, height } as PixelBox;
  if (box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0 || box.x + box.width > image.width || box.y + box.height > image.height) {
    throw new VisionError(code);
  }
  const left = Math.floor(box.x);
  const top = Math.floor(box.y);
  return { x: left, y: top, width: Math.ceil(box.x + box.width) - left, height: Math.ceil(box.y + box.height) - top };
}

function validatePeople(raw: unknown, image: { width: number; height: number }): PersonDetection {
  if (!isRecord(raw) || raw.width !== image.width || raw.height !== image.height || !Array.isArray(raw.boxes) || raw.boxes.length > 32) {
    throw new VisionError('invalid_people');
  }
  return { width: image.width, height: image.height, boxes: raw.boxes.map((box) => validateBox(box, image, 'invalid_people')) };
}

function validateMask(raw: unknown, image: { width: number; height: number }): RasterMask {
  if (!isRecord(raw) || raw.width !== image.width || raw.height !== image.height || !(raw.pixels instanceof Uint8Array) || raw.pixels.length !== image.width * image.height) {
    throw new VisionError('invalid_mask');
  }
  const box = validateBox(raw.box, image, 'invalid_mask', true);
  const pixels = Uint8Array.from(raw.pixels);
  for (let i = 0; i < pixels.length; i++) {
    const bit = pixels[i];
    const x = i % image.width;
    const y = Math.floor(i / image.width);
    if ((bit !== 0 && bit !== 1) || (bit === 1 && (x < box.x || x >= box.x + box.width || y < box.y || y >= box.y + box.height))) {
      throw new VisionError('invalid_mask');
    }
  }
  return { width: image.width, height: image.height, box, pixels };
}

function intersects(a: PixelBox, b: PixelBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Shared by intake and card composition; no visual-design or card-delivery policy here. */
export async function renderMaskedCutout(image: Buffer, mask: RasterMask, personBoxes: PixelBox[]): Promise<Buffer> {
  const decoded = await decodeImage(image);
  image = decoded.bytes;
  const dimensions = { width: decoded.width, height: decoded.height };
  mask = validateMask(mask, dimensions);
  const people = validatePeople({ ...dimensions, boxes: personBoxes }, dimensions);
  if (people.boxes.some((person) => intersects(mask.box, person))) throw new VisionError('person_overlap');
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < mask.pixels.length; i++) {
    if (!mask.pixels[i]) data.fill(0, i * 4, i * 4 + 4);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: mask.box.x, top: mask.box.y, width: mask.box.width, height: mask.box.height })
    .png().toBuffer();
}
