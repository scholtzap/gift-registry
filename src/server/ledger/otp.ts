import { createHash, randomInt } from "node:crypto";
import type { Db } from "@/server/db/client";

/**
 * Login codes for the email return path (docs/plans/otp-return-path.md).
 * The hash is of the identifier the person typed, email or phone.
 * Everything runs on the login role: `otp_codes` denies both app roles by
 * policy, so there is no scoped path here by construction.
 */

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_ACTIVE_PER_IDENTIFIER = 3;

/** Purpose-separated pepper: a phone-hash crack must not become a code crack. */
export function hashOtpCode(code: string, pepper: string): string {
  return createHash("sha256").update(`${code}:${pepper}:otp-v1`).digest("hex");
}

export function randomOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function findActiveOtpCount(db: Db, identifierHash: string): Promise<number> {
  return db.prisma.otpCode.count({
    where: { identifierHash, used: false, expiresAt: { gt: new Date() } },
  });
}

/**
 * Mint one code, or null when the identifier already holds the maximum live
 * codes. Null is not an error: the route answers uniform and sends nothing.
 */
export async function issueOtpCode(
  db: Db, userId: string, identifierHash: string, pepper: string,
): Promise<{ code: string } | null> {
  const now = new Date();
  await db.prisma.otpCode.deleteMany({ where: { expiresAt: { lt: now } } });
  if ((await findActiveOtpCount(db, identifierHash)) >= OTP_MAX_ACTIVE_PER_IDENTIFIER) return null;
  const code = randomOtpCode();
  await db.prisma.otpCode.create({
    data: {
      phoneE164Hash: identifierHash,
      identifierHash,
      userId,
      codeHash: hashOtpCode(code, pepper),
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    },
  });
  return { code };
}

/**
 * Check a presented code. Success burns it; any failure burns one attempt on
 * every live code for the identifier (they all belong to the same person, and
 * per-row feedback would say which row matched). Online guessing is bounded
 * by the attempt cap plus the request throttle.
 */
export async function verifyOtpCode(
  db: Db, identifierHash: string, code: string, pepper: string,
): Promise<{ userId: string } | null> {
  const now = new Date();
  const live = await db.prisma.otpCode.findMany({
    where: { identifierHash, used: false, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  const codeHash = hashOtpCode(code, pepper);
  const match = live.find((row) => row.attempts < OTP_MAX_ATTEMPTS && row.codeHash === codeHash);
  if (!match) {
    if (live.length > 0) {
      await db.prisma.otpCode.updateMany({
        where: { id: { in: live.map((row) => row.id) } },
        data: { attempts: { increment: 1 } },
      });
    }
    return null;
  }
  await db.prisma.otpCode.update({ where: { id: match.id }, data: { used: true } });
  return { userId: match.userId };
}
