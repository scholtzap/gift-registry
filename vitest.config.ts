import 'dotenv/config';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(process.cwd(), 'src') },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/leak/global-setup.ts'],
    // RLS assertions are only honest on a real Postgres 16, so the suite cannot parallelise
    // against one database: the migrations and the policy application are global state.
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
