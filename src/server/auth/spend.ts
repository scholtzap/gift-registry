import type { Db } from "@/server/db/client";

/**
 * Per-owner daily model spend quota (F8b).
 *
 * Consent (`can()`) decides WHETHER a call may happen; this decides HOW MANY
 * per day. The key is the circle OWNER (budget is the owner's, per the
 * entitlements module): a friend's voice note spends the owner's budget, so a
 * compromised circle cannot burn the platform blind. Counts only real
 * (non-demo) model calls, once per call, enforced before the fetch.
 * Fail closed: a store outage denies with a retryable-shaped error rather
 * than bypassing the limit.
 */

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS model_spend (
  owner_id UUID NOT NULL,
  day DATE NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_id, day)
)`;

let ensured = false;

async function ensureTable(db: Db): Promise<void> {
  if (ensured) return;
  await db.prisma.$executeRawUnsafe(CREATE_SQL);
  ensured = true;
}

export async function checkModelSpend(
  db: Db,
  ownerId: string,
  limit: number,
  now = Date.now(),
): Promise<void> {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new TypeError("invalid_spend_limit");
  await ensureTable(db);
  const day = new Date(now);
  try {
    const rows = await db.prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO model_spend (owner_id, day, count)
      VALUES (${ownerId}::uuid, ${day}::date, 1)
      ON CONFLICT (owner_id, day) DO UPDATE SET count = model_spend.count + 1
      RETURNING count`;
    if ((rows[0]?.count ?? 1) > limit) throw new Error("model_spend_exceeded");
  } catch (error) {
    if (error instanceof Error && error.message === "model_spend_exceeded") throw error;
    throw new Error("model_spend_unavailable");
  }
}
