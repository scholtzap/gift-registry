import { expect, it } from 'vitest';
import { createWhatsAppWebhook } from '@/server/wa/webhook';

it('exports a Request/Response handler that verifies before touching a real Db client', async () => {
  Object.assign(process.env, {
    DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/unused',
    SESSION_SECRET: 'synthetic-test-only-session-secret-not-live', PHONE_HASH_PEPPER: 'synthetic-test-only-phone-pepper-value',
    CIRCLE_BASE_URL: 'https://registry.example',
    WHATSAPP_VERIFY_TOKEN: 'synthetic-verify-token', WHATSAPP_APP_SECRET: 'synthetic-webhook-secret-not-a-live-key',
  });
  const { createDb } = await import('@/server/db/client');
  const db = createDb('postgresql://synthetic:synthetic@127.0.0.1:1/unused');
  try {
    const handler = createWhatsAppWebhook(db);
    const reply = await handler(new Request('https://registry.example/api/wa/webhook?hub.mode=subscribe&hub.verify_token=synthetic-verify-token&hub.challenge=000123'));
    expect(await reply.text()).toBe('000123');
    const forged = await handler(new Request('https://registry.example/api/wa/webhook', { method: 'POST', body: '{}', headers: { 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) } }));
    expect(forged.status).toBe(403);
  } finally { await db.disconnect(); }
});

it('rejects a malformed worker event key before any database or external request', async () => {
  Object.assign(process.env, { DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/unused', SESSION_SECRET: 'synthetic-test-only-session-secret-not-live', PHONE_HASH_PEPPER: 'synthetic-test-only-phone-pepper-value', CIRCLE_BASE_URL: 'https://registry.example' });
  const { createDb } = await import('@/server/db/client');
  const { processIngest } = await import('@/server/intake/process');
  const db = createDb('postgresql://synthetic:synthetic@127.0.0.1:1/unused');
  try { await expect(processIngest(db, '../../untrusted-job-key')).rejects.toThrow('ingest_event_id_rejected'); }
  finally { await db.disconnect(); }
});
