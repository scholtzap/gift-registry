import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { readBoundedBody } from './http';

export interface WebhookConfig { appSecret?: string; verifyToken?: string; phoneNumberId?: string }
export interface SenderIdentity { bsuid?: string; phoneE164?: string }
export interface InboundMessage {
  waMessageId: string;
  identity: SenderIdentity;
  timestamp: number;
  kind: 'audio' | 'image' | 'text' | 'url';
  mediaId?: string;
  mimeType?: string;
  text?: string;
  interactiveId?: string;
}

const id = z.string().min(1).max(512);
const media = z.object({ id, mime_type: z.string().max(100) });
const message = z.object({
  id, from: id.optional(), from_user_id: id.optional(), timestamp: z.string().regex(/^\d{1,12}$/), type: z.string(),
  audio: media.optional(), image: media.optional(), text: z.object({ body: z.string().max(4096) }).optional(),
  interactive: z.object({
    type: z.string(), button_reply: z.object({ id }).optional(), list_reply: z.object({ id }).optional(),
  }).optional(),
});
const envelope = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(z.object({ changes: z.array(z.object({ field: z.string(), value: z.object({
    metadata: z.object({ phone_number_id: id }).optional(),
    contacts: z.array(z.object({ wa_id: id.optional(), user_id: id.optional() })).optional(),
    messages: z.array(message).max(100).optional(),
  }) })).max(100) })).max(100),
});

/** Raw bytes are authenticated before JSON is interpreted. No DB or external calls. */
export async function receiveWebhook(request: Request, config: WebhookConfig): Promise<Response | { messages: InboundMessage[] }> {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    if (!config.verifyToken) return new Response('Unavailable', { status: 503 });
    if (url.searchParams.get('hub.mode') !== 'subscribe' || url.searchParams.get('hub.verify_token') !== config.verifyToken) {
      return new Response('Forbidden', { status: 403 });
    }
    const challenge = url.searchParams.get('hub.challenge');
    return challenge === null ? new Response('Bad request', { status: 400 }) : new Response(challenge);
  }
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!config.appSecret) return new Response('Unavailable', { status: 503 });
  const signature = request.headers.get('x-hub-signature-256');
  if (!signature || !/^sha256=[a-fA-F0-9]{64}$/.test(signature)) return new Response('Forbidden', { status: 403 });
  let raw: Buffer;
  try { raw = await readBoundedBody(request, 1024 * 1024, 5000); }
  catch (error) { return new Response('Bad request', { status: error instanceof Error && error.message === 'body_too_large' ? 413 : 408 }); }
  const expected = createHmac('sha256', config.appSecret).update(raw).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) return new Response('Forbidden', { status: 403 });
  let parsed: z.infer<typeof envelope>;
  try { parsed = envelope.parse(JSON.parse(raw.toString('utf8'))); }
  catch { return new Response('Bad request', { status: 400 }); }
  const messages: InboundMessage[] = [];
  for (const entry of parsed.entry) for (const change of entry.changes) {
    if (change.field !== 'messages') continue;
    if (config.phoneNumberId && change.value.metadata?.phone_number_id !== config.phoneNumberId) continue;
    for (const m of change.value.messages ?? []) {
      const contact = change.value.contacts?.find(c => c.wa_id !== undefined && c.wa_id === m.from);
      const bsuid = m.from_user_id ?? contact?.user_id;
      const phoneE164 = m.from && /^[1-9]\d{6,14}$/.test(m.from) ? '+' + m.from : undefined;
      const identity: SenderIdentity = bsuid ? { bsuid } : phoneE164 ? { phoneE164 } : {};
      if (!bsuid && !phoneE164) continue;
      const base = { waMessageId: m.id, identity, timestamp: Number(m.timestamp) };
      if ((m.type === 'audio' || m.type === 'image') && m[m.type]) {
        const data = m[m.type]!;
        messages.push({ ...base, kind: m.type, mediaId: data.id, mimeType: data.mime_type });
      } else if (m.type === 'text' && m.text) {
        const text = m.text.body;
        messages.push({ ...base, kind: /^https:\/\/\S+$/.test(text) ? 'url' : 'text', text });
      } else if (m.type === 'interactive' && m.interactive) {
        const interactiveId = m.interactive.type === 'button_reply' ? m.interactive.button_reply?.id
          : m.interactive.type === 'list_reply' ? m.interactive.list_reply?.id : undefined;
        if (interactiveId) messages.push({ ...base, kind: 'text', interactiveId });
      }
    }
  }
  return { messages };
}
