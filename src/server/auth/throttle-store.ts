import type { Db } from "@/server/db/client";
import {
  THROTTLE_MAX_ATTEMPTS,
  THROTTLE_WINDOW_MS,
  checkGateThrottles,
  type ThrottleSpec,
} from "./throttle";

/**
 * Shared throttle budget across processes (F2).
 *
 * The in-memory map in `throttle.ts` is per-process: a second process doubles
 * every budget. When the app runs behind the production proxy
 * (`TRUSTED_PROXY=on`), buckets live in Postgres so N processes share one
 * budget; everywhere else (dev, demo, tests) the memory check is used.
 *
 * Semantics match the memory check exactly: every key must allow, otherwise
 * none is incremented and the largest Retry-After wins; a store error denies
 * (fail closed) with a 60s Retry-After rather than bypassing the limit.
 * The table is created lazily and expand-only — no migration, and the previous
 * image tag keeps running against a database that already has (or lacks) it.
 */

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS throttle_buckets (
  key TEXT PRIMARY KEY,
  count INT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
)`;

let ensured = false;

async function ensureTable(db: Db): Promise<void> {
  if (ensured) return;
  await db.prisma.$executeRawUnsafe(CREATE_SQL);
  ensured = true;
}

interface BucketRow {
  count: number;
  expires_at: Date;
}

export async function gateThrottle(
  db: Db,
  specs: Array<string | ThrottleSpec>,
  now = Date.now(),
  maxAttempts = THROTTLE_MAX_ATTEMPTS,
): Promise<{ allowed: boolean; retryAfter: number }> {
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 4096) {
    throw new TypeError("invalid_throttle_limit");
  }
  if (process.env.TRUSTED_PROXY !== "on") {
    return checkGateThrottles(specs, now, maxAttempts);
  }
  try {
    await ensureTable(db);
    return await db.prisma.$transaction(async (tx) => {
      if (!Array.isArray(specs) || specs.length === 0) throw new TypeError("invalid_throttle_keys");
      const normalized = specs.map((spec) => {
        const entry =
          typeof spec === "string" ? { key: spec, max: maxAttempts } : { key: spec.key, max: spec.max ?? maxAttempts };
        if (typeof entry.key !== "string" || entry.key.length === 0 || entry.key.length > 256) {
          throw new TypeError("invalid_throttle_key");
        }
        if (!Number.isSafeInteger(entry.max) || entry.max < 1 || entry.max > 4096) {
          throw new TypeError("invalid_throttle_limit");
        }
        return entry;
      });
      if (!Number.isSafeInteger(now) || now < 0) throw new RangeError("invalid_throttle_clock");
      const distinct = [...new Map(normalized.map((entry) => [entry.key, entry])).values()];

      const states = new Map<string, { count: number; expiresAtMs: number }>();
      let deniedAfter = 0;
      for (const { key, max } of distinct) {
        const rows = await tx.$queryRaw<BucketRow[]>`
          SELECT count, expires_at FROM throttle_buckets WHERE key = ${key} FOR UPDATE`;
        const row = rows[0];
        const expiresAtMs = row ? row.expires_at.getTime() : 0;
        if (!row || expiresAtMs <= now) {
          states.set(key, { count: 0, expiresAtMs: now + THROTTLE_WINDOW_MS });
          continue;
        }
        states.set(key, { count: row.count, expiresAtMs });
        if (row.count >= max) {
          deniedAfter = Math.max(deniedAfter, Math.ceil((expiresAtMs - now) / 1000));
        }
      }
      if (deniedAfter > 0) return { allowed: false, retryAfter: deniedAfter };

      for (const { key } of distinct) {
        const state = states.get(key)!;
        if (state.count === 0) {
          await tx.$executeRaw`
            INSERT INTO throttle_buckets (key, count, expires_at)
            VALUES (${key}, 1, ${new Date(state.expiresAtMs)})
            ON CONFLICT (key) DO UPDATE SET count = 1, expires_at = EXCLUDED.expires_at`;
        } else {
          await tx.$executeRaw`
            UPDATE throttle_buckets SET count = count + 1 WHERE key = ${key}`;
        }
      }
      return { allowed: true, retryAfter: 0 };
    });
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw error;
    // Fail closed: a store outage denies with a retry hint instead of
    // bypassing the limit. Denials keep the uniform body + Retry-After shape.
    return { allowed: false, retryAfter: 60 };
  }
}
