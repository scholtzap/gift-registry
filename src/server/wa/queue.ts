import { PgBoss } from 'pg-boss';
import type { Db } from '@/server/db/client';

export const INGEST_QUEUE = 'whatsapp-ingest';
export interface IngestJob { eventId: string }
const queues = new WeakMap<Db, Promise<PgBoss>>();

/** pg-boss 12.38: named export, explicit queue creation, array work handlers. */
export function getIngestQueue(db: Db): Promise<PgBoss> {
  let queue = queues.get(db);
  if (!queue) {
    queue = (async () => {
      const boss = new PgBoss({ db: { executeSql: (sql, values) => db.pool.query(sql, values) }, schedule: false });
      boss.on('error', () => console.error('ingest_queue_error'));
      try {
        await boss.start();
        await boss.createQueue(INGEST_QUEUE, { policy: 'singleton', retryLimit: 3, retryDelay: 3, retryBackoff: true, expireInSeconds: 120 });
        return boss;
      } catch (error) { await boss.stop(); throw error; }
    })();
    queues.set(db, queue);
    void queue.catch(() => queues.delete(db));
  }
  return queue;
}

export async function stopIngestQueue(db: Db): Promise<void> {
  const queue = queues.get(db);
  queues.delete(db);
  if (queue) await (await queue).stop();
}
