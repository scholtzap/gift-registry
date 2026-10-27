import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { constants } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile, link, lstat } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Actor, Db, Tx } from '@/server/db/client';
import { createCutoutExtractor, renderMaskedCutout, type RasterMask, type VisionServices } from '@/server/vision';
import { mask, syntheticPhoto } from '../fixtures/vision/synthetic';

// Fault/scheduling hooks delegate to real disk operations; there is no virtual filesystem.
const io = vi.hoisted(() => ({
  write: undefined as undefined | ((file: FileHandle, bytes: Buffer, write: (bytes: Buffer) => Promise<void>) => Promise<void>),
  close: undefined as undefined | ((close: () => Promise<void>) => Promise<void>),
  publish: undefined as undefined | ((temp: string, final: string, publish: () => Promise<void>) => Promise<void>),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...fs,
    open: async (...args: Parameters<typeof fs.open>) => {
      const file = await fs.open(...args);
      if (typeof args[1] === 'number' && (args[1] & constants.O_WRONLY)) {
        const write = file.writeFile.bind(file);
        const close = file.close.bind(file);
        vi.spyOn(file, 'writeFile').mockImplementation(async (bytes) => {
          if (!Buffer.isBuffer(bytes)) throw new Error('expected_png_buffer');
          if (io.write) await io.write(file, bytes, write);
          else await write(bytes);
        });
        vi.spyOn(file, 'close').mockImplementation(async () => {
          if (io.close) await io.close(close);
          else await close();
        });
      }
      return file;
    },
    link: async (temp: Parameters<typeof fs.link>[0], final: Parameters<typeof fs.link>[1]) => {
      const publish = () => fs.link(temp, final);
      if (io.publish) await io.publish(String(temp), String(final), publish);
      else await publish();
    },
  };
});

const actor: Actor = { role: 'friend', userId: 'fictional-vision-friend', circleId: 'fictional-vision-circle' };
// Exercise the real assertCan with an in-memory transaction, not a Postgres/RLS claim.
const tx = {
  entitlement: { findUnique: async () => ({ enabled: true, expiresAt: null }) },
  user: { findUnique: async () => ({ plan: 'free' }) },
} as unknown as Tx;
const db = { withActor: async <T>(_actor: Actor, work: (tx: Tx) => Promise<T>) => work(tx) } as Db;

let mediaDir: string;
let imagePath: string;
let source: Buffer;
beforeEach(async () => {
  mediaDir = await mkdtemp(join(tmpdir(), 'pinata-vision-publication-'));
  imagePath = join(mediaDir, 'source.png');
  source = await syntheticPhoto();
  await writeFile(imagePath, source);
});
afterEach(async () => {
  io.write = undefined;
  io.close = undefined;
  io.publish = undefined;
  vi.restoreAllMocks();
  await rm(mediaDir, { recursive: true, force: true });
});

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
function extract(output: RasterMask = mask()) {
  const services: VisionServices = {
    mode: 'demo',
    detectPeople: async () => ({ width: 12, height: 8, boxes: [] }),
    segment: async () => [output],
  };
  return createCutoutExtractor({ mediaDir, sourceId: 'publication-regression', services, DEMO_MODE: true })(db, actor, imagePath);
}
function differentMask() {
  const different = mask();
  different.pixels[25] = 0;
  return different;
}
async function outputDirectory() {
  const scopes = await readdir(join(mediaDir, 'cutouts'));
  expect(scopes).toHaveLength(1);
  return join(mediaDir, 'cutouts', scopes[0]!);
}
function fault() { return Object.assign(new Error('injected_disk_failure'), { code: 'EIO' }); }

// Promise barriers, never sleeps: the second extraction completes while the first is paused.
describe('real-filesystem publication through createCutoutExtractor', () => {
  it.each(['same', 'different'] as const)('handles concurrent %s output while the first write is partial', async (kind) => {
    const entered = signal();
    const release = signal();
    let paused = false;
    let firstHandle: FileHandle | undefined;
    io.write = async (file, bytes, write) => {
      if (!paused) {
        paused = true;
        firstHandle = file;
        await write(bytes.subarray(0, 8));
        entered.resolve();
        await release.promise;
        // writeFile uses the current offset; complete the actual partial file.
        await write(bytes.subarray(8));
      } else await write(bytes);
    };
    const first = extract().then((value) => ({ value }), (error: unknown) => ({ error }));
    let outcome: Awaited<typeof first>;
    let second: Awaited<ReturnType<typeof extract>> | undefined;
    let namesDuringWrite: string[] = [];
    try {
      await Promise.race([
        entered.promise,
        first.then(() => { throw new Error('extraction_finished_before_partial_write'); }),
      ]);
      namesDuringWrite = await readdir(await outputDirectory());
      second = await extract(kind === 'same' ? mask() : differentMask());
    } finally {
      release.resolve();
      outcome = await first;
    }
    expect(namesDuringWrite).toHaveLength(1);
    expect(namesDuringWrite[0]).not.toBe('0.png');
    expect(firstHandle!.fd).toBe(-1);
    const directory = await outputDirectory();
    expect(await readdir(directory)).toEqual(['0.png']);
    const expected = await renderMaskedCutout(source, kind === 'same' ? mask() : differentMask(), []);
    expect(await readFile(join(directory, '0.png'))).toEqual(expected);
    expect((await lstat(join(directory, '0.png'))).nlink).toBe(1);
    if (kind === 'same') expect(outcome).toEqual({ value: second });
    else expect(outcome).toMatchObject({ error: { code: 'cutout_conflict' } });
    io.write = undefined;
    await expect(extract(kind === 'same' ? mask() : differentMask())).resolves.toEqual(second);
  });

  it.each(['same', 'different'] as const)('handles %s output while a winner still has its temporary hard link', async (kind) => {
    const entered = signal();
    const release = signal();
    let paused = false;
    let written: FileHandle | undefined;
    io.write = async (file, bytes, write) => { written = file; await write(bytes); };
    io.publish = async (temp, final, publish) => {
      expect(written!.fd).toBe(-1);
      expect(dirname(temp)).toBe(dirname(final));
      await publish();
      if (!paused) {
        paused = true;
        entered.resolve();
        await release.promise;
      }
    };
    const winner = extract();
    let result: Awaited<typeof winner>;
    let loser: unknown;
    let inode: number | undefined;
    try {
      await Promise.race([
        entered.promise,
        winner.then(() => { throw new Error('final_was_not_published_by_link'); }),
      ]);
      const directory = await outputDirectory();
      const published = await lstat(join(directory, '0.png'));
      expect(published.nlink).toBe(2);
      inode = published.ino;
      expect(await readFile(join(directory, '0.png'))).toEqual(await renderMaskedCutout(source, mask(), []));
      loser = await extract(kind === 'same' ? mask() : differentMask()).catch((error: unknown) => error);
    } finally {
      release.resolve();
      result = await winner;
    }
    if (kind === 'same') expect(loser).toEqual(result);
    else expect(loser).toMatchObject({ code: 'cutout_conflict' });
    const directory = await outputDirectory();
    expect(await readdir(directory)).toEqual(['0.png']);
    expect(await lstat(join(directory, '0.png'))).toMatchObject({ nlink: 1, ino: inode });
    expect(await readFile(join(directory, '0.png'))).toEqual(await renderMaskedCutout(source, mask(), []));
  });

  it.each(['empty-write', 'partial-write', 'close', 'publication'] as const)('cleans up after %s failure and permits a clean retry', async (stage) => {
    const error = fault();
    let handle: FileHandle | undefined;
    io.write = async (file, bytes, write) => {
      handle = file;
      if (stage === 'empty-write') throw error;
      if (stage === 'partial-write') {
        await write(bytes.subarray(0, 8));
        throw error;
      }
      await write(bytes);
    };
    if (stage === 'close') io.close = async (close) => { await close(); throw error; };
    if (stage === 'publication') io.publish = async () => { throw error; };
    await expect(extract()).rejects.toBe(error);
    expect(handle!.fd).toBe(-1);
    const directory = await outputDirectory();
    expect(await readdir(directory)).toEqual([]);
    io.write = undefined;
    io.close = undefined;
    io.publish = undefined;
    const retry = await extract();
    expect(retry.candidates).toHaveLength(1);
    expect(dirname(join(mediaDir, retry.candidates[0]!.imagePath))).toBe(directory);
    expect(await readdir(directory)).toEqual(['0.png']);
    expect(await readFile(join(directory, '0.png'))).toEqual(await renderMaskedCutout(source, mask(), []));
  });

  it('still refuses an existing final hard link not belonging to a private publication', async () => {
    const result = await extract();
    const cutout = join(mediaDir, result.candidates[0]!.imagePath);
    const outside = await mkdtemp(join(tmpdir(), 'pinata-vision-linked-'));
    try {
      const external = join(outside, 'external.png');
      await writeFile(external, await renderMaskedCutout(source, mask(), []));
      await rm(cutout);
      await link(external, cutout);
      await expect(extract()).rejects.toMatchObject({ code: 'unsafe_media_path' });
      expect(await readFile(external)).toEqual(await renderMaskedCutout(source, mask(), []));
      expect(await readdir(dirname(cutout))).toEqual(['0.png']);
    } finally { await rm(outside, { recursive: true, force: true }); }
  });

  it('keeps source hard-link reads forbidden before any output work', async () => {
    await link(imagePath, join(mediaDir, 'source-alias.png'));
    await expect(extract()).rejects.toMatchObject({ code: 'unsafe_media_path' });
    expect((await readdir(mediaDir)).sort()).toEqual(['source-alias.png', 'source.png']);
  });
});
