import { fromPrisma } from 'pg-boss';
import type { Db } from '@/server/db/client';
import type { Prisma } from '@/generated/prisma/client';
import { receiveWebhook } from './protocol';
import { resolveSender } from './identity';
import { gateThrottle } from '@/server/auth/throttle-store';
import { getIngestQueue, INGEST_QUEUE } from './queue';
import { downloadIngestMedia } from '@/server/intake/process';
import { FIXED_MENU } from '@/server/agent/tasks';

export { processIngest } from '@/server/intake/process';

/** Route adapter mounts this handler unchanged; only authenticated raw payloads reach the DB. */
export function createWhatsAppWebhook(db: Db): (request: Request) => Promise<Response> {
  return async request => {
    const headers = { 'Cache-Control': 'private, no-store' };
    const { env } = await import('@/lib/env');
    const received = await receiveWebhook(request, { appSecret: env.WHATSAPP_APP_SECRET, verifyToken: env.WHATSAPP_VERIFY_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID });
    if (received instanceof Response) { received.headers.set('Cache-Control', 'private, no-store'); return received; }
    let reply: string | undefined;
    try {
      for (const message of received.messages) {
        // Ingest abuse throttle (F2): per-sender and per-business buckets.
        // A denial stays 200 with no work queued — Meta retries non-2xx, so a
        // 429 here would turn a burst into a retry storm.
        const senderKey = message.identity.bsuid ?? message.identity.phoneE164 ?? 'unknown';
        const waGate = await gateThrottle(db, [
          { key: `wa:${senderKey}`, max: 30 },
          { key: `wa-biz:${env.WHATSAPP_PHONE_NUMBER_ID ?? 'default'}`, max: 300 },
        ]);
        if (!waGate.allowed) continue;
        const actor = await resolveSender(db, message.identity);
        if (!actor || !actor.circleId) { reply = FIXED_MENU; continue; }
        const boss = await getIngestQueue(db);
        const event = await db.prisma.$transaction(async tx => {
          const membership = await tx.membership.findFirst({ where: { circleId: actor.circleId!, userId: actor.userId, role: actor.role, status: 'active', circle: { status: 'active' } }, select: { id: true } });
          if (!membership) return null;
          const input = { kind: message.kind, timestamp: message.timestamp, mediaId: message.mediaId, mimeType: message.mimeType, text: message.text, interactiveId: message.interactiveId };
          const draft = JSON.parse(JSON.stringify({ version: 1, actorRole: actor.role, input })) as Prisma.InputJsonValue;
          const row = await tx.ingestEvent.upsert({
            where: { waMessageId: message.waMessageId }, update: {},
            create: { waMessageId: message.waMessageId, circleId: actor.circleId!, userId: actor.userId, kind: message.kind, draft,
              mediaExpiresAt: message.mediaId ? new Date((message.timestamp + 7 * 86400) * 1000) : null },
            select: { id: true, status: true, circleId: true, userId: true },
          });
          if (row.circleId !== actor.circleId || row.userId !== actor.userId) return null;
          // Queue and event commit together. Meta retry cannot strand a received event without a job.
          if (!['parsed', 'confirmed'].includes(row.status)) {
            await boss.send(INGEST_QUEUE, { eventId: row.id }, { id: row.id, singletonKey: row.id, db: fromPrisma(tx) });
          }
          return row;
        }, { timeout: 5000 });
        if (!event) { reply = FIXED_MENU; continue; }
        if (message.kind === 'audio' || message.kind === 'image') {
          try { await downloadIngestMedia(db, event.id); }
          catch (error) { if (!(error instanceof Error && error.message === 'ingest_busy')) throw error; }
        } else if (message.kind === 'text' && !message.interactiveId) reply = FIXED_MENU;
      }
      // A webhook response is not a WhatsApp send. Transport delivery is intentionally separate.
      // The `reply` key is always present (null when every message routed to
      // async work) so denied and accepted callers see the same body shape.
      return Response.json({ ok: true, reply: reply ?? null }, { headers });
    } catch { return Response.json({ error: 'Webhook temporarily unavailable' }, { status: 503, headers }); }
  };
}
