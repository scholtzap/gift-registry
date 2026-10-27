import { createHmac, timingSafeEqual } from "node:crypto";

export function keyedHash(value: string, pepper: string): string {
  return createHmac("sha256", pepper).update(value).digest("hex");
}

/**
 * The allowlist stores only a keyed hash of an E.164 phone number: a leaked table must not
 * be a phone list, and a per-installation pepper means the same number cannot be correlated
 * across deployments. Comparison is constant-time because the caller is proving possession
 * of a number, not reading a row.
 */
export function hashPhone(phoneE164: string, pepper: string): string {
  const normalized = normalizeE164(phoneE164);
  if (normalized === null) throw new Error("phone is not E.164");
  return keyedHash(normalized, pepper);
}

export function phoneHashMatches(phoneE164: string, hash: string, pepper: string): boolean {
  const candidate = Buffer.from(hashPhone(phoneE164, pepper), "hex");
  const stored = Buffer.from(hash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

/** Canonical form this app stores. Anything else is a different key for the same person. */
export function normalizeE164(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits.startsWith("+")) return null;
  const num = digits.slice(1);
  if (num.length < 9 || num.length > 15) return null;
  return `+${num}`;
}
