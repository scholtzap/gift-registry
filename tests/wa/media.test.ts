import { expect, it } from 'vitest';
import { downloadMedia } from '@/server/wa/media';

it('refuses a media metadata URL outside the exact Meta HTTPS host without sending bearer credentials there', async () => {
  const requests: string[] = [];
  const http: typeof fetch = async input => {
    requests.push(String(input));
    return Response.json({ url: 'https://lookaside.fbsbx.com.attacker.example/steal', mime_type: 'audio/ogg', file_size: 10 });
  };
  await expect(downloadMedia('fixture-media-id', 'audio', { accessToken: 'synthetic-access-token', graphVersion: 'v23.0' }, http)).rejects.toThrow('media_url_rejected');
  expect(requests).toEqual(['https://graph.facebook.com/v23.0/fixture-media-id']);
});

it('bounds downloaded image bytes even when metadata omits size and Content-Length is absent', async () => {
  let calls = 0;
  const http: typeof fetch = async () => ++calls === 1
    ? Response.json({ url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/', mime_type: 'image/jpeg' })
    : new Response(new Uint8Array(5 * 1024 * 1024 + 1));
  await expect(downloadMedia('fixture-image', 'image', { accessToken: 'synthetic-access-token', graphVersion: 'v23.0' }, http).then(() => 'accepted')).rejects.toThrow('body_too_large');
});

it('uses a committed media fixture only under explicit demo mode without requiring a live WhatsApp token', async () => {
  let calls = 0;
  const http: typeof fetch = async () => { calls++; throw new Error('live_http_forbidden'); };
  const result = await downloadMedia('fixture-image', 'image', { accessToken: '', graphVersion: 'v23.0', demoMode: 'on' }, http);
  expect(result.mimeType).toBe('image/png');
  expect(Array.from(result.bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(calls).toBe(0);
  await expect(downloadMedia('fixture-image', 'image', { accessToken: '', graphVersion: 'v23.0', demoMode: 'off' }, http)).rejects.toThrow('whatsapp_not_configured');
});

it('refuses HTML delivered as media even when Graph metadata names an expected image type', async () => {
  let calls = 0;
  const http: typeof fetch = async () => ++calls === 1
    ? Response.json({ url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/', mime_type: 'image/png' })
    : new Response('<html>not an image</html>', { headers: { 'content-type': 'text/html' } });
  await expect(downloadMedia('fixture-image', 'image', { accessToken: 'synthetic-access-token', graphVersion: 'v23.0' }, http).then(() => 'accepted')).rejects.toThrow('media_type_rejected');
});
