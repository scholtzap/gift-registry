import { beforeEach, expect, it, vi } from 'vitest';

/**
 * RN-D Gate 5 / M6: boot rejects a missing PHONE_HASH_PEPPER and one equal to
 * SESSION_SECRET. A leaked session secret must not also crack phone hashes.
 */
beforeEach(() => vi.resetModules());

const base = {
  DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/unused',
  CIRCLE_BASE_URL: 'https://registry.example',
  SESSION_SECRET: 'synthetic-test-only-session-secret-not-live',
};

async function loadWith(extra: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries({ ...base, ...extra })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.resetModules();
  return import('@/lib/env');
}

it('rejects a missing PHONE_HASH_PEPPER at boot', async () => {
  await expect(loadWith({ PHONE_HASH_PEPPER: undefined })).rejects.toThrow(/PHONE_HASH_PEPPER/);
});

it('rejects a pepper equal to SESSION_SECRET at boot', async () => {
  await expect(
    loadWith({ PHONE_HASH_PEPPER: base.SESSION_SECRET }),
  ).rejects.toThrow(/PHONE_HASH_PEPPER/);
});

it('accepts a distinct pepper of 32+ characters', async () => {
  const { loadEnv } = await loadWith({ PHONE_HASH_PEPPER: 'synthetic-test-only-phone-pepper-value' });
  expect(loadEnv().PHONE_HASH_PEPPER).toBe('synthetic-test-only-phone-pepper-value');
});
