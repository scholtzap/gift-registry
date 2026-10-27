import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { Db } from '@/server/db/client';
import { processIngest } from '@/server/intake/process';
import { getIngestQueue, INGEST_QUEUE, stopIngestQueue, type IngestJob } from '@/server/wa/queue';

/** Call from a worker bootstrap, not a route. pg-boss work() receives an array in v12.38. */
export async function startIngestWorker(db: Db): Promise<() => Promise<void>> {
  const boss = await getIngestQueue(db);
  await boss.work<IngestJob>(INGEST_QUEUE, { batchSize: 1, pollingIntervalSeconds: 1 }, async jobs => {
    for (const job of jobs) {
      const payload = z.object({ eventId: z.string().uuid() }).strict().parse(job.data);
      await processIngest(db, payload.eventId);
    }
  });
  return async () => { await boss.offWork(INGEST_QUEUE); await stopIngestQueue(db); };
}

async function main() {
  const { getAppDb } = await import('@/server/db/client');
  const db = getAppDb();
  let stop: (() => Promise<void>) | undefined;
  try { stop = await startIngestWorker(db); }
  catch { await db.disconnect(); throw new Error('ingest_worker_start_failed'); }
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    try { await stop?.(); }
    finally { await db.disconnect(); }
  };
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch(() => { console.error('ingest_worker_failed'); process.exitCode = 1; });
}
