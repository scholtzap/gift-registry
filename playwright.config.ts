import 'dotenv/config';
import { defineConfig } from '@playwright/test';

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) throw new Error('DATABASE_URL_TEST is required');
const origin = 'http://127.0.0.1:3001';
const production = process.env.PLAYWRIGHT_PRODUCTION === '1';
process.env.SESSION_SECRET = 'browser-fixture-signing-key-not-a-live-credential';
process.env.PHONE_HASH_PEPPER = 'browser-fixture-pepper-not-a-live-credential';
process.env.CIRCLE_BASE_URL = origin;

export default defineConfig({
  testDir: './tests/browser',
  globalSetup: './tests/browser/global-setup.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  reporter: 'list',
  use: { baseURL: origin, viewport: { width: 390, height: 844 }, trace: 'off' },
  webServer: {
    command: `pnpm exec next ${production ? 'start' : 'dev'} --hostname 127.0.0.1 --port 3001`,
    url: origin,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: testUrl,
      SESSION_SECRET: process.env.SESSION_SECRET,
      CIRCLE_BASE_URL: origin,
      NEXT_DIST_DIR: production ? '.next-verification' : '.next-browser',
      DEMO_MODE: 'off',
      PHONE_HASH_PEPPER: 'browser-fixture-pepper-not-a-live-credential',
      WHATSAPP_VERIFY_TOKEN: 'browser-fixture-verify-token',
      WHATSAPP_APP_SECRET: 'browser-fixture-webhook-secret-not-live',
    },
  },
});
