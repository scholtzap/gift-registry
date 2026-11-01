export const THROTTLE_WINDOW_MS = 60_000;
export const THROTTLE_MAX_ATTEMPTS = 5;
const MAX_KEYS = 4096;
const attempts = new Map<string, { count: number; expiresAt: number }>();

const WINDOW_MS = THROTTLE_WINDOW_MS;
const MAX_ATTEMPTS = THROTTLE_MAX_ATTEMPTS;

function validateKey(key: string): void {
  if (typeof key !== 'string' || key.length === 0 || key.length > 256) throw new TypeError('invalid_throttle_key');
}

function validateClock(now: number): void {
  if (!Number.isSafeInteger(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - WINDOW_MS) {
    throw new RangeError('invalid_throttle_clock');
  }
}

/** SINGLE INSTANCE ONLY: restarts reset state; multiple processes do not share it.
 * Prefer `gateThrottle` (throttle-store), which uses the shared Postgres bucket
 * when TRUSTED_PROXY=on and falls back here otherwise.
 * Retry-After is in seconds. Use a trusted-address + phone-hash key, never raw identity.
 * Call before any gate lookup, for successes and failures alike.
 */
export function checkGateThrottle(key: string, now = Date.now()): { allowed: boolean; retryAfter: number } {
  validateKey(key);
  validateClock(now);
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

export interface ThrottleSpec {
  key: string;
  /** Per-bucket budget; defaults to the gate limit. Looser for address-only buckets. */
  max?: number;
}

/**
 * Rotation-resistant multi-bucket check: EVERY key must allow, otherwise none
 * is incremented and the largest Retry-After wins. Pass the pair key, an
 * address-only key and a global per-number key together so rotating phone
 * numbers (or a spoofed forwarding header) cannot bypass the gate. Same
 * fail-closed capacity rule as the single-key check.
 */
export function checkGateThrottles(specs: Array<string | ThrottleSpec>, now = Date.now(), maxAttempts = MAX_ATTEMPTS): { allowed: boolean; retryAfter: number } {
  if (!Array.isArray(specs) || specs.length === 0) throw new TypeError('invalid_throttle_keys');
  const normalized = specs.map((spec) => {
    const entry = typeof spec === 'string' ? { key: spec, max: maxAttempts } : { key: spec.key, max: spec.max ?? maxAttempts };
    validateKey(entry.key);
    if (!Number.isSafeInteger(entry.max) || entry.max < 1 || entry.max > 4096) throw new TypeError('invalid_throttle_limit');
    return entry;
  });
  validateClock(now);
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 4096) throw new TypeError('invalid_throttle_limit');

  let deniedAfter = 0;
  const fresh: string[] = [];
  for (const { key, max } of normalized) {
    if (fresh.includes(key)) continue;
    const bucket = attempts.get(key);
    if (!bucket || now >= bucket.expiresAt) {
      fresh.push(key);
      continue;
    }
    if (bucket.count >= max) {
      deniedAfter = Math.max(deniedAfter, Math.ceil((bucket.expiresAt - now) / 1000));
    }
  }
  if (deniedAfter > 0) return { allowed: false, retryAfter: deniedAfter };

  if (fresh.length > 0) {
    for (const key of fresh) attempts.delete(key);
    if (attempts.size + fresh.length > MAX_KEYS) {
      let earliestExpiry = Infinity;
      for (const [storedKey, stored] of attempts) {
        if (now >= stored.expiresAt) attempts.delete(storedKey);
        else earliestExpiry = Math.min(earliestExpiry, stored.expiresAt);
      }
      if (attempts.size + fresh.length > MAX_KEYS) {
        return { allowed: false, retryAfter: Math.ceil((earliestExpiry - now) / 1000) };
      }
    }
    for (const key of fresh) attempts.set(key, { count: 1, expiresAt: now + WINDOW_MS });
  }
  for (const key of new Set(normalized.map((entry) => entry.key))) {
    if (!fresh.includes(key)) attempts.get(key)!.count++;
  }
  return { allowed: true, retryAfter: 0 };
}
