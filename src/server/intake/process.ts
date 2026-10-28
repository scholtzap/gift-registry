import { z } from 'zod';
import type { Actor, Db } from '@/server/db/client';
import type { Prisma } from '@/generated/prisma/client';
import type { Env } from '@/lib/env';
import { assertCan, CapabilityOffError, CapabilityUnavailableError } from '@/server/entitlements';
import { modelsForActor } from '@/server/models/client';
import { downloadMedia } from '@/server/wa/media';
import { resolveMembership } from '@/server/wa/identity';
import { mediaFilePath, readStoredMedia, storeMedia, withIngestLock } from '@/server/wa/store';
import { FIXED_MENU, routeWhatsAppTask } from '@/server/agent/tasks';
import { dispatchTask } from '@/server/agent/dispatch';
import { intakeSteps } from './pipeline';
import silence from '../../../tests/fixtures/models/pcm16-silence.json';

export interface ProcessResult { status: 'parsed' | 'failed' | 'skipped'; reply: string }
const inputSchema = z.object({
  kind: z.enum(['audio', 'image', 'url', 'text']), timestamp: z.number().int().nonnegative(),
  mediaId: z.string().max(512).optional(), mimeType: z.string().max(100).optional(),
  text: z.string().max(4096).optional(), interactiveId: z.string().max(512).optional(),
}).strict();
const evidenceSchema = z.object({ model: z.string(), mode: z.enum(['live', 'demo_fixture']), inputTokens: z.number().int().nonnegative().nullable(), outputTokens: z.number().int().nonnegative().nullable(), latencyMs: z.number().nonnegative() });
const recordSchema = z.object({ version: z.literal(1), input: inputSchema, transcript: z.string().max(16000).optional(), evidence: z.array(evidenceSchema).optional() }).passthrough();
type RecordState = z.infer<typeof recordSchema>;
const eventSelect = { id: true, circleId: true, userId: true, kind: true, draft: true, status: true, mediaExpiresAt: true } as const;
type Event = Prisma.IngestEventGetPayload<{ select: typeof eventSelect }>;

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function eventKey(eventId: string): void {
  if (!z.string().uuid().safeParse(eventId).success) throw new Error('ingest_event_id_rejected');
}
async function save(db: Db, actor: Actor, eventId: string, state: RecordState, data: { status?: 'converted' | 'transcribed' | 'parsed' | 'failed'; error?: string | null; modelUsed?: string; mediaPath?: string }) {
  await db.withActor(actor, async tx => {
    await tx.ingestEvent.updateMany({ where: { id: eventId, userId: actor.userId, circleId: actor.circleId!, status: { not: 'confirmed' } }, data: { ...data, draft: json(state) } });
  });
}
async function consent(db: Db, actor: Actor, kind: Event['kind']) {
  if (kind === 'text') return;
  const capability = kind === 'audio' ? 'voice_transcribe' : kind === 'image' ? 'photo_extract' : 'link_expand';
  await db.withActor(actor, tx => assertCan(tx, actor, capability));
}
async function media(db: Db, actor: Actor, event: Event, state: RecordState, env: Env): Promise<Buffer> {
  const kind = event.kind;
  if (kind !== 'audio' && kind !== 'image') throw new Error('media_kind_rejected');
  const limit = (kind === 'image' ? 5 : 16) * 1024 * 1024;
  const stored = await readStoredMedia(env.MEDIA_DIR, event.id, limit);
  if (stored) return stored;
  if (!state.input.mediaId || (env.DEMO_MODE !== 'on' && event.mediaExpiresAt && event.mediaExpiresAt.getTime() < Date.now())) throw new Error('media_expired_or_missing');
  const downloaded = await downloadMedia(state.input.mediaId, kind, { accessToken: env.WHATSAPP_ACCESS_TOKEN ?? '', graphVersion: env.WHATSAPP_GRAPH_API_VERSION, demoMode: env.DEMO_MODE });
  const path = await storeMedia(env.MEDIA_DIR, event.id, downloaded.bytes);
  state.input.mimeType = downloaded.mimeType;
  await save(db, actor, event.id, state, { mediaPath: path });
  return Buffer.from(downloaded.bytes);
}

async function failure(db: Db, actor: Actor, event: Event, state: RecordState, error: unknown): Promise<ProcessResult> {
  const off = error instanceof CapabilityOffError;
  const unavailable = error instanceof CapabilityUnavailableError;
  const reply = off ? `${FIXED_MENU}\n${error.degraded}` : `${FIXED_MENU}\nIntake is unavailable. Add the gift manually in your circle.`;
  state.reply = reply;
  const reason = off ? `capability_off:${error.capability}` : unavailable ? 'capability_unavailable' : error instanceof Error && ['model_not_configured', 'whatsapp_not_configured', 'model_output_rejected', 'retailer_url_rejected', 'media_expired_or_missing'].includes(error.message) ? error.message : 'intake_failed';
  await save(db, actor, event.id, state, { status: 'failed', error: reason });
  if (off || unavailable || ['model_not_configured', 'whatsapp_not_configured', 'retailer_url_rejected', 'model_output_rejected', 'media_expired_or_missing'].includes(reason)) return { status: 'failed', reply };
  throw new Error('ingest_retryable_failure');
}

/** Immediate ingest download; no model call here and no transaction is held over HTTP. */
export async function downloadIngestMedia(db: Db, eventId: string): Promise<void> {
  eventKey(eventId);
  await withIngestLock(db, eventId, async () => {
    const event = await db.prisma.ingestEvent.findUnique({ where: { id: eventId }, select: eventSelect });
    if (!event || !['audio', 'image'].includes(event.kind) || ['parsed', 'confirmed'].includes(event.status)) return;
    const actor = await resolveMembership(db, event.userId, event.circleId);
    if (!actor) return;
    const state = recordSchema.parse(event.draft);
    try {
      await consent(db, actor, event.kind);
      const { env } = await import('@/lib/env');
      await media(db, actor, event, state, env);
    } catch (error) { await failure(db, actor, event, state, error); }
  });
}

/** Worker-only seam: the actor is resolved from the trusted event and current membership. */
export async function processIngest(db: Db, eventId: string): Promise<ProcessResult> {
  eventKey(eventId);
  return withIngestLock(db, eventId, async () => {
    const event = await db.prisma.ingestEvent.findUnique({ where: { id: eventId }, select: eventSelect });
    if (!event) return { status: 'skipped', reply: FIXED_MENU };
    const actor = await resolveMembership(db, event.userId, event.circleId);
    if (!actor) return { status: 'skipped', reply: FIXED_MENU };
    const state = recordSchema.parse(event.draft);
    if (['parsed', 'confirmed'].includes(event.status)) return { status: 'skipped', reply: typeof state.reply === 'string' ? state.reply : FIXED_MENU };
    const route = routeWhatsAppTask({ waMessageId: event.id, identity: {}, ...state.input });
    if (route.type === 'menu') {
      state.reply = FIXED_MENU;
      await save(db, actor, eventId, state, { status: 'parsed', error: null });
      return { status: 'parsed', reply: FIXED_MENU };
    }
    try {
      if (event.kind === 'text') {
        // The fixed menu above is the compliance floor and is never gated. Choosing and
        // running a task is assistant work: `assistant_reply` decides, before any state
        // can change. Off lands in failure() as fixed menu + degraded copy.
        await db.withActor(actor, tx => assertCan(tx, actor, 'assistant_reply'));
        const reply = await db.withActor(actor, async tx => {
          const answer = await dispatchTask(tx, actor, route.intent);
          await tx.ingestEvent.update({ where: { id: eventId }, data: { status: 'parsed', error: null, draft: json({ ...state, reply: answer }) } });
          return answer;
        });
        return { status: 'parsed', reply };
      }
      await consent(db, actor, event.kind);
      const { env } = await import('@/lib/env');
      const models = modelsForActor(db, actor, { demoMode: env.DEMO_MODE, apiKey: env.MODEL_API_KEY, baseUrl: env.MODEL_API_BASE_URL });
      const bytes = event.kind === 'audio' && state.transcript ? undefined
        : event.kind === 'audio' || event.kind === 'image' ? await media(db, actor, event, state, env) : undefined;
      const input = { kind: event.kind, bytes, mimeType: state.input.mimeType, url: state.input.text, transcript: state.transcript, evidence: state.evidence };
      for await (const step of intakeSteps(input, models, {
        ffmpegPath: env.FFMPEG_PATH,
        demoMode: env.DEMO_MODE,
        imagePath: event.kind === 'image' ? mediaFilePath(env.MEDIA_DIR, eventId) : undefined,
        currency: await db.withActor(actor, async tx => {
          const c = await tx.circle.findFirst({ where: { id: actor.circleId! }, select: { defaultCurrency: true } });
          return c?.defaultCurrency ?? undefined;
        }).catch(() => undefined),
        // This is an explicit demo fixture, never an error fallback in the live path.
        convert: env.DEMO_MODE === 'on' ? async () => Buffer.from(silence.wavBase64, 'base64') : undefined,
      })) {
        if (step.transcript !== undefined) state.transcript = step.transcript;
        state.evidence = step.evidence;
        if (step.candidates) state.candidates = step.candidates;
        state.reply = 'Piñata AI: Your draft is ready for you to confirm or edit in your circle.';
        const modelUsed = step.evidence.some(e => e.mode === 'demo_fixture') ? 'demo_fixture' : step.evidence.length ? step.evidence.map(e => e.model).join(',') : 'retailer_metadata';
        await save(db, actor, eventId, state, { status: step.status, error: null, modelUsed });
      }
      return { status: 'parsed', reply: String(state.reply) };
    } catch (error) { return failure(db, actor, event, state, error); }
  });
}
