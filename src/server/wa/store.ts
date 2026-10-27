import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { Db } from '@/server/db/client';

/** Filenames are database UUIDs, never media IDs, WhatsApp message IDs, or model text. */
export function mediaFilePath(mediaDir: string, eventId: string): string {
  return join(resolve(mediaDir), 'ingest', `${z.string().uuid().parse(eventId)}.bin`);
}
export async function readStoredMedia(mediaDir: string, eventId: string, limit: number): Promise<Buffer | null> {
  let file;
  try { file = await open(mediaFilePath(mediaDir, eventId), 'r'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > limit) throw new Error('stored_media_rejected');
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of file.createReadStream({ autoClose: false })) {
      length += chunk.length;
      if (length > limit) throw new Error('stored_media_rejected');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, length);
  } finally { await file.close(); }
}
export async function storeMedia(mediaDir: string, eventId: string, bytes: Uint8Array): Promise<string> {
  const path = mediaFilePath(mediaDir, eventId);
  await mkdir(join(resolve(mediaDir), 'ingest'), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  const file = await open(temp, 'wx', 0o600);
  try {
    try { await file.writeFile(bytes); await file.sync(); }
    finally { await file.close(); }
    await rename(temp, path);
    return path;
  } finally { await unlink(temp).catch(() => undefined); }
}

/** Session advisory lock, NOT a transaction: network work cannot exhaust withActor's 10s timeout. */
export async function withIngestLock<T>(db: Db, eventId: string, work: () => Promise<T>): Promise<T> {
  z.string().uuid().parse(eventId);
  const client = await db.advisoryPool.connect();
  let locked = false;
  try {
    const result = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked', [`ingest:${eventId}`]);
    locked = result.rows[0]?.locked === true;
    if (!locked) throw new Error('ingest_busy');
    return await work();
  } finally {
    let discard = false;
    if (locked) {
      try { await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [`ingest:${eventId}`]); }
      catch { discard = true; }
    }
    client.release(discard);
  }
}
