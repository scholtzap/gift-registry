import type { Db } from "@/server/db/client";

/**
 * Idempotency keys for money-affecting writes (F8).
 *
 * A double-clicked submit or a retried POST must not create two pools, two
 * pledges or two card entries. Every state-changing form renders a fresh
 * `idempotencyKey` (`<IdemKey />`); the first POST with a key wins and a
 * replay within 24h returns the safe outcome — a redirect to the ledger that
 * already shows the created entity — instead of running the write again.
 * Keys are scoped to (actor, circle): one person's key can never dedupe
 * another person's write. Keys older than 24h are treated as fresh so the
 * table stays small; a day-old key replaying is a new intent, not a retry.
 */

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  circle_id UUID NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

let ensured = false;

async function ensureTable(db: Db): Promise<void> {
  if (ensured) return;
  await db.prisma.$executeRawUnsafe(CREATE_SQL);
  ensured = true;
}

const KEY_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function parseIdempotencyKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return KEY_RE.test(trimmed) ? trimmed : null;
}

/** True when this key is seen for the first time (or expired); false on replay. */
export async function claimIdempotencyKey(
  db: Db,
  key: string,
  circleId: string,
  userId: string,
  now = Date.now(),
): Promise<boolean> {
  await ensureTable(db);
  // Insert-first: the INSERT arbitrates concurrent first claims atomically,
  // so two in-flight POSTs with a fresh key cannot both win. Only the loser
  // falls through to the scope/TTL read below.
  const inserted = await db.prisma.$executeRaw`
    INSERT INTO idempotency_keys (key, circle_id, user_id, created_at)
    VALUES (${key}, ${circleId}::uuid, ${userId}::uuid, ${new Date(now)})
    ON CONFLICT (key) DO NOTHING`;
  if (inserted === 1) return true;
  const rows = await db.prisma.$queryRaw<Array<{ circle_id: string; user_id: string; created_at: Date }>>`
    SELECT circle_id, user_id, created_at FROM idempotency_keys WHERE key = ${key}`;
  const row = rows[0];
  if (!row) return true;
  if (row.circle_id !== circleId || row.user_id !== userId) return true;
  if (row.created_at.getTime() + IDEMPOTENCY_TTL_MS <= now) {
    await db.prisma.$executeRaw`
      UPDATE idempotency_keys SET created_at = ${new Date(now)} WHERE key = ${key}`;
    return true;
  }
  return false;
}
