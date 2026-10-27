import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

/**
 * Product photos a person attaches to a gift. Every upload is decoded and re-encoded, so what is
 * stored is pixels only: no EXIF, GPS location, camera serial or embedded thumbnail survives.
 * Files are named by a fresh UUID, never by anything the uploader sent. Serving goes through the
 * circle route, which checks the viewer's projection first (see `photoFor` in routes/circle.ts).
 */

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PHOTO_PATH = /^photos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

export class PhotoRejectedError extends Error {
  constructor(reason: string) {
    super(`photo_rejected: ${reason}`);
    this.name = 'PhotoRejectedError';
  }
}

/** Re-encode an upload to a metadata-free WebP no larger than 1200px and store it. */
export async function storePhoto(mediaDir: string, file: File): Promise<string> {
  if (!PHOTO_TYPES.has(file.type)) throw new PhotoRejectedError('type');
  if (file.size === 0 || file.size > PHOTO_MAX_BYTES) throw new PhotoRejectedError('size');
  let webp: Buffer;
  try {
    // rotate() applies the EXIF orientation before the metadata is dropped; sharp writes none
    // back because withMetadata() is never called.
    webp = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000, failOn: 'error' })
      .rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new PhotoRejectedError('decode');
  }
  const relative = `photos/${randomUUID()}.webp`;
  const root = resolve(mediaDir);
  await mkdir(join(root, 'photos'), { recursive: true, mode: 0o700 });
  const target = join(root, relative);
  const temp = `${target}.${randomUUID()}.tmp`;
  const handle = await open(temp, 'wx', 0o600);
  try {
    try { await handle.writeFile(webp); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temp, target);
    return relative;
  } finally { await unlink(temp).catch(() => undefined); }
}

/** True only for a path `storePhoto` wrote; older intake paths in `items.image_path` are not photos. */
export function isStoredPhoto(relative: string | null): relative is string {
  return relative !== null && PHOTO_PATH.test(relative);
}

/** Bytes of a stored photo, or null for anything that is not one of ours. */
export async function readPhoto(mediaDir: string, relative: string | null): Promise<Buffer | null> {
  if (!isStoredPhoto(relative)) return null;
  try { return await readFile(join(resolve(mediaDir), relative)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

export async function deletePhoto(mediaDir: string, relative: string): Promise<void> {
  if (PHOTO_PATH.test(relative)) await unlink(join(resolve(mediaDir), relative)).catch(() => undefined);
}
