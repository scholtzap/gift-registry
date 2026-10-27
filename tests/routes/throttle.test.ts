import { beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());

it('allows five attempts, then returns a rounded-up retry without extending the window', async () => {
  const { checkGateThrottle } = await import('@/server/auth/throttle');
  for (let attempt = 0; attempt < 5; attempt++) {
    expect(checkGateThrottle('phone-hash:trusted-address', 1_000)).toEqual({ allowed: true, retryAfter: 0 });
  }
  expect(checkGateThrottle('phone-hash:trusted-address', 1_001)).toEqual({ allowed: false, retryAfter: 60 });
  expect(checkGateThrottle('phone-hash:trusted-address', 60_001)).toEqual({ allowed: false, retryAfter: 1 });
  expect(checkGateThrottle('phone-hash:trusted-address', 61_000)).toEqual({ allowed: true, retryAfter: 0 });
});

it('fails closed at 4096 live keys without evicting limits, then reclaims expired capacity', async () => {
  const { checkGateThrottle } = await import('@/server/auth/throttle');
  for (let key = 0; key < 4096; key++) {
    expect(checkGateThrottle(`hash:address-${key}`, 0)).toEqual({ allowed: true, retryAfter: 0 });
  }
  for (let attempt = 1; attempt < 5; attempt++) checkGateThrottle('hash:address-0', 0);
  expect(checkGateThrottle('overflow', 59_999)).toEqual({ allowed: false, retryAfter: 1 });
  expect(checkGateThrottle('hash:address-0', 59_999)).toEqual({ allowed: false, retryAfter: 1 });
  expect(checkGateThrottle('overflow', 60_000)).toEqual({ allowed: true, retryAfter: 0 });
});

it('rejects empty or oversized keys and invalid clocks before storing state', async () => {
  const { checkGateThrottle } = await import('@/server/auth/throttle');
  for (const key of ['', 'x'.repeat(257)]) expect(() => checkGateThrottle(key, 0)).toThrow(TypeError);
  for (const now of [NaN, Infinity, -1]) expect(() => checkGateThrottle('key', now)).toThrow(RangeError);
  expect(checkGateThrottle('x'.repeat(256), 0)).toEqual({ allowed: true, retryAfter: 0 });
});

it('keeps keys independent and uses the injectable default clock', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(10_000);
  try {
    const { checkGateThrottle } = await import('@/server/auth/throttle');
    for (let attempt = 0; attempt < 5; attempt++) checkGateThrottle('address-a');
    expect(checkGateThrottle('address-b')).toEqual({ allowed: true, retryAfter: 0 });
    expect(checkGateThrottle('address-a')).toEqual({ allowed: false, retryAfter: 60 });
    vi.mocked(Date.now).mockReturnValue(70_000);
    expect(checkGateThrottle('address-a')).toEqual({ allowed: true, retryAfter: 0 });
  } finally {
    vi.restoreAllMocks();
  }
});
