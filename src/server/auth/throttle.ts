const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;
const MAX_KEYS = 4096;
const attempts = new Map<string, { count: number; expiresAt: number }>();

/** SINGLE INSTANCE ONLY: restarts reset state; multiple processes do not share it.
 * Retry-After is in seconds. Use a trusted-address + phone-hash key, never raw identity.
 * Call before any gate lookup, for successes and failures alike.
 */
export function checkGateThrottle(key: string, now = Date.now()): { allowed: boolean; retryAfter: number } {
  if (typeof key !== 'string' || key.length === 0 || key.length > 256) throw new TypeError('invalid_throttle_key');
  if (!Number.isSafeInteger(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - WINDOW_MS) {
    throw new RangeError('invalid_throttle_clock');
  }
  const bucket = attempts.get(key);
  if (!bucket || now >= bucket.expiresAt) {
    if (bucket) attempts.delete(key);
    if (attempts.size >= MAX_KEYS) {
      let earliestExpiry = Infinity;
      for (const [storedKey, stored] of attempts) {
        if (now >= stored.expiresAt) attempts.delete(storedKey);
        else earliestExpiry = Math.min(earliestExpiry, stored.expiresAt);
      }
      // Never evict a live bucket: rotating keys must not reset an attacker's limit.
      if (attempts.size >= MAX_KEYS) {
        return { allowed: false, retryAfter: Math.ceil((earliestExpiry - now) / 1000) };
      }
    }
    attempts.set(key, { count: 1, expiresAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  if (bucket.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.ceil((bucket.expiresAt - now) / 1000) };
  }
  bucket.count++;
  return { allowed: true, retryAfter: 0 };
}
