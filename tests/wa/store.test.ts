import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { mediaFilePath, readStoredMedia, storeMedia } from '@/server/wa/store';

const eventId = '10000000-0000-4000-8000-000000000001';

it('removes its private temporary file when media writing fails after the file was opened', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pinata-intake-test-'));
  try {
    // Invalid JS-boundary data induces a real FileHandle.writeFile failure, not a virtual filesystem.
    await expect(storeMedia(dir, eventId, undefined as unknown as Uint8Array)).rejects.toThrow();
    expect(await readdir(join(dir, 'ingest'))).toEqual([]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('stores and reads bounded synthetic media under a database UUID without retaining temporary files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pinata-intake-test-'));
  try {
    expect(await storeMedia(dir, eventId, Buffer.from('fictional-media'))).toBe(mediaFilePath(dir, eventId));
    expect(await readStoredMedia(dir, eventId, 32)).toEqual(Buffer.from('fictional-media'));
    await expect(readStoredMedia(dir, eventId, 2)).rejects.toThrow('stored_media_rejected');
    expect(await readdir(join(dir, 'ingest'))).toEqual([`${eventId}.bin`]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('refuses non-UUID media paths before touching storage', () => {
  expect(() => mediaFilePath(tmpdir(), '../user-selected-name')).toThrow();
});
