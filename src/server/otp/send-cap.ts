import type { Db } from "@/server/db/client";

/** Actual deliveries per recipient address, whether the lookup used email or phone. */
export const OTP_SEND_MAX_PER_HOUR = 5;
export const OTP_SEND_WINDOW_MS = 60 * 60 * 1000;

const memory = new Map<string, { count: number; expiresAt: number }>();

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS throttle_buckets (
  key TEXT PRIMARY KEY,
  count INT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
)`;

/**
 * Reserve one send to this email hash. False means "do not send"; the route
 * still answers with the same page as a miss. The key is the stored address
 * hash, so looking the person up by phone and by email share one cap.
 * A store error fails closed (no send).
 */
export async function reserveRecipientSend(db: Db, emailHash: string, now = Date.now()): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(emailHash)) return false;
  const key = `otp-send:${emailHash}`;
  if (process.env.TRUSTED_PROXY !== "on") {
    const bucket = memory.get(key);
    if (!bucket || now >= bucket.expiresAt) {
      memory.set(key, { count: 1, expiresAt: now + OTP_SEND_WINDOW_MS });
      return true;
    }
    if (bucket.count >= OTP_SEND_MAX_PER_HOUR) return false;
    bucket.count += 1;
    return true;
  }
  try {
    await db.prisma.$executeRawUnsafe(CREATE_SQL);
    return await db.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ count: number; expires_at: Date }[]>`
        SELECT count, expires_at FROM throttle_buckets WHERE key = ${key} FOR UPDATE`;
      const row = rows[0];
      const expiresAt = row ? row.expires_at.getTime() : 0;
      if (!row || expiresAt <= now) {
        const until = new Date(now + OTP_SEND_WINDOW_MS);
        await tx.$executeRaw`
          INSERT INTO throttle_buckets (key, count, expires_at)
          VALUES (${key}, 1, ${until})
          ON CONFLICT (key) DO UPDATE SET count = 1, expires_at = EXCLUDED.expires_at`;
        return true;
      }
      if (row.count >= OTP_SEND_MAX_PER_HOUR) return false;
      await tx.$executeRaw`UPDATE throttle_buckets SET count = count + 1 WHERE key = ${key}`;
      return true;
    });
  } catch {
    return false;
  }
}
