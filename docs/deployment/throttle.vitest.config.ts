import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('../../', import.meta.url));

// This pure helper suite needs no database or production environment values.
export default defineConfig({
  root,
  resolve: { alias: { '@': resolve(root, 'src') } },
  test: {
    include: ['tests/routes/throttle.test.ts'],
    globalSetup: [],
    fileParallelism: false,
  },
});
