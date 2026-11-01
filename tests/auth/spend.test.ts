import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDb, type Db } from '@/server/db/client';
import { checkModelSpend } from '@/server/auth/spend';

/**
 * Per-owner daily model spend quota (F8b): counts real calls, denies over the
 * limit, resets on a new day, and isolates owners from each other.
 */

let db: Db;

beforeAll(async () => {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  db = createDb(url);
});

afterAll(async () => {
  await db?.disconnect();
});

it('counts calls and denies over the daily limit', async () => {
  const owner = randomUUID();
  const now = Date.now();
  await checkModelSpend(db, owner, 2, now);
  await checkModelSpend(db, owner, 2, now);
  await expect(checkModelSpend(db, owner, 2, now)).rejects.toThrow('model_spend_exceeded');
});

it('resets the budget on a new day and isolates owners from each other', async () => {
  const a = randomUUID();
  const b = randomUUID();
  const t0 = Date.now();
  const t1 = t0 + 25 * 60 * 60 * 1000;
  await checkModelSpend(db, a, 1, t0);
  await checkModelSpend(db, b, 1, t0);
  await expect(checkModelSpend(db, a, 1, t0)).rejects.toThrow('model_spend_exceeded');
  await checkModelSpend(db, a, 1, t1);
});
