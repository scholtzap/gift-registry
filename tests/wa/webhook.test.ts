import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { receiveWebhook } from '@/server/wa/protocol';

const config = { appSecret: 'synthetic-webhook-secret-not-a-live-key', verifyToken: 'synthetic-verify-token' };
const signature = (body: string) => 'sha256=' + createHmac('sha256', config.appSecret).update(body).digest('hex');
const post = (body: string, sig = signature(body)) => new Request('https://registry.example/api/wa/webhook', {
  method: 'POST', body, headers: { 'x-hub-signature-256': sig },
});

describe('WhatsApp HTTP receive', () => {
  it('returns the exact verify challenge only for the subscribed token', async () => {
    const result = await receiveWebhook(new Request('https://registry.example/api/wa/webhook?hub.mode=subscribe&hub.verify_token=synthetic-verify-token&hub.challenge=000123'), config);
    expect(result).toBeInstanceOf(Response);
    expect(await (result as Response).text()).toBe('000123');
  });

  it('rejects a signature over reserialized JSON before trying to parse malformed raw bytes', async () => {
    const result = await receiveWebhook(post('{ bad json', signature('{}')), config);
    expect((result as Response).status).toBe(403);
  });

  it('normalizes a signed Cloud API message without requiring a phone when BSUID exists', async () => {
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp', metadata: { phone_number_id: 'business-fixture-id' },
      contacts: [{ user_id: 'fixture-owner-bsuid', profile: { name: 'Fictional Owner' } }],
      messages: [{ id: 'wamid.fixture.voice', from_user_id: 'fixture-owner-bsuid', timestamp: '1793059200', type: 'audio', audio: { id: 'media-fixture-1', mime_type: 'audio/ogg; codecs=opus' } }],
    } }] }] });
    const result = await receiveWebhook(post(body), config);
    expect(result).toEqual({ messages: [{ waMessageId: 'wamid.fixture.voice', identity: { bsuid: 'fixture-owner-bsuid' }, timestamp: 1793059200, kind: 'audio', mediaId: 'media-fixture-1', mimeType: 'audio/ogg; codecs=opus' }] });
  });

  it('rejects a signed oversized raw body instead of parsing or allocating it without a bound', async () => {
    const result = await receiveWebhook(post(' '.repeat(1024 * 1024 + 1)), config);
    expect((result as Response).status).toBe(413);
  });

  it('refuses the verify challenge for a wrong token, including a different-length one (timing-safe)', async () => {
    for (const token of ['wrong-token', 'x'.repeat(200)]) {
      const result = await receiveWebhook(new Request(`https://registry.example/api/wa/webhook?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=000123`), config);
      expect((result as Response).status).toBe(403);
    }
  });

  it('drops future-dated messages but keeps past ones for idempotent redelivery (F7)', async () => {
    const message = (id: string, timestamp: string) => ({ id, from_user_id: 'fixture-owner-bsuid', timestamp, type: 'text', text: { body: 'Hello' } });
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp', metadata: { phone_number_id: 'business-fixture-id' },
      messages: [
        message('wamid.past', '1793059200'),
        message('wamid.future', String(Math.floor(Date.now() / 1000) + 3600)),
      ],
    } }] }] });
    const result = await receiveWebhook(post(body), config);
    expect(result).toEqual({ messages: [{ waMessageId: 'wamid.past', identity: { bsuid: 'fixture-owner-bsuid' }, timestamp: 1793059200, kind: 'text', text: 'Hello' }] });
  });
});
