import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CircleFixture } from '../leak/fixtures';

let fx: CircleFixture;
let mediaDir: string;
let sender: string;
let ownerSender: string;
let slug: string;
let handler: ReturnType<typeof import('@/server/wa/webhook').createWhatsAppWebhook>;
let processIngest: typeof import('@/server/intake/process').processIngest;
let getCircle: typeof import('@/server/routes/circle').handleCircleGet;
let postCircle: typeof import('@/server/routes/circle').handleCirclePost;
let cookieFor: (role: 'owner' | 'friend') => string;
let appOrigin: string;
const secret = 'synthetic-webhook-secret-not-a-live-key';
const events: string[] = [];
const externalHttp = vi.fn(() => { throw new Error('unexpected_external_request'); });

beforeAll(async () => {
  mediaDir = await mkdtemp(join(tmpdir(), 'pinata-intake-'));
  vi.stubEnv('WHATSAPP_APP_SECRET', secret);
  vi.stubEnv('WHATSAPP_VERIFY_TOKEN', 'synthetic-verify-token');
  vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'fictional-business-number-id');
  vi.stubEnv('DEMO_MODE', 'on');
  vi.stubEnv('MEDIA_DIR', mediaDir);
  vi.stubGlobal('fetch', externalHttp);
  const { seedCircle } = await import('../leak/fixtures');
  fx = await seedCircle(process.env.DATABASE_URL_TEST!);
  sender = (await fx.db.prisma.user.findUniqueOrThrow({ where: { id: fx.friendAUserId } })).bsuid!;
  ownerSender = (await fx.db.prisma.user.findUniqueOrThrow({ where: { id: fx.ownerUserId } })).bsuid!;
  slug = (await fx.db.prisma.circle.findUniqueOrThrow({ where: { id: fx.circleId } })).shareSlug;
  const webhook = await import('@/server/wa/webhook');
  handler = webhook.createWhatsAppWebhook(fx.db);
  processIngest = webhook.processIngest;
  const routes = await import('@/server/routes/circle');
  getCircle = routes.handleCircleGet;
  postCircle = routes.handleCirclePost;
  const { issueSession, SESSION_COOKIE } = await import('@/server/auth/session');
  cookieFor = role => `${SESSION_COOKIE}=${issueSession({ role, userId: role === 'owner' ? fx.ownerUserId : fx.friendAUserId, circleId: fx.circleId })}`;
  const { env } = await import('@/lib/env');
  appOrigin = new URL(env.CIRCLE_BASE_URL).origin;
});

afterAll(async () => {
  if (fx) {
    const { getIngestQueue, INGEST_QUEUE, stopIngestQueue } = await import('@/server/wa/queue');
    try {
      const queue = await getIngestQueue(fx.db);
      if (events.length) await queue.deleteJob(INGEST_QUEUE, events);
      await fx.db.prisma.circle.deleteMany({ where: { id: { in: [fx.circleId, fx.otherCircleId] } } });
      await fx.db.prisma.user.deleteMany({ where: { id: { in: [fx.ownerUserId, fx.friendAUserId, fx.friendBUserId, fx.outsiderUserId] } } });
    } finally {
      await stopIngestQueue(fx.db);
      await fx.db.disconnect();
    }
  }
  if (mediaDir) await rm(mediaDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function signed(message: Record<string, unknown>, bsuid = sender, businessId = 'fictional-business-number-id'): Request {
  const raw = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
    metadata: { phone_number_id: businessId }, messages: [{ from_user_id: bsuid, timestamp: String(Math.floor(Date.now() / 1000)), ...message }],
  } }] }] });
  return new Request(`${appOrigin}/api/wa/webhook`, { method: 'POST', body: raw, headers: {
    'content-type': 'application/json', 'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`,
  } });
}
async function receive(message: Record<string, unknown>, bsuid = sender) {
  const id = `fictional-message-${randomUUID()}`;
  const response = await handler(signed({ id, ...message }, bsuid));
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toContain('no-store');
  const row = await fx.db.prisma.ingestEvent.findUniqueOrThrow({ where: { waMessageId: id } });
  events.push(row.id);
  return row;
}
async function interactive(intent: Record<string, unknown>, bsuid = sender) {
  return receive({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: JSON.stringify(intent) } } }, bsuid);
}

describe('signed WhatsApp intake on real PostgreSQL', () => {
  it('commits one event and one pg-boss job across signed redelivery', async () => {
    const row = await receive({ type: 'text', text: { body: 'Hello, unrelated free text.' } });
    expect((await handler(signed({ id: row.waMessageId, type: 'text', text: { body: 'Hello, unrelated free text.' } }))).status).toBe(200);
    expect(await fx.db.prisma.ingestEvent.count({ where: { waMessageId: row.waMessageId } })).toBe(1);
    const { getIngestQueue, INGEST_QUEUE } = await import('@/server/wa/queue');
    const jobs = await (await getIngestQueue(fx.db)).findJobs(INGEST_QUEUE, { id: row.id });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data).toEqual({ eventId: row.id });
    expect((await processIngest(fx.db, row.id)).reply).toContain('six tasks only');
    expect((await processIngest(fx.db, row.id)).status).toBe('skipped');
  });

  it('ignores a valid signature for a different business number', async () => {
    const id = `fictional-message-${randomUUID()}`;
    expect((await handler(signed({ id, type: 'text', text: { body: 'Hello' } }, sender, 'different-business-id'))).status).toBe(200);
    expect(await fx.db.prisma.ingestEvent.count({ where: { waMessageId: id } })).toBe(0);
  });

  it('downloads demo media immediately and persists gated transcription checkpoints', async () => {
    const row = await receive({ type: 'audio', audio: { id: 'fictional-media-id', mime_type: 'audio/ogg' } });
    const cached = await fx.db.prisma.ingestEvent.findUniqueOrThrow({ where: { id: row.id } });
    expect(cached.mediaPath).toContain(mediaDir);
    const { readStoredMedia } = await import('@/server/wa/store');
    expect((await readStoredMedia(mediaDir, row.id, 16 * 1024 * 1024))?.length).toBeGreaterThan(0);
    expect((await processIngest(fx.db, row.id)).status).toBe('parsed');
    const parsed = await fx.db.prisma.ingestEvent.findUniqueOrThrow({ where: { id: row.id } });
    expect(parsed).toMatchObject({ status: 'parsed', modelUsed: 'demo_fixture', itemId: null });
    expect(parsed.draft).toMatchObject({ version: 1, candidates: [{ title: 'Fictional bicycle lamp', priceMinor: 12500, state: 'pending' }], evidence: [
      { model: 'muse-voice-transcribe-1.0', mode: 'demo_fixture' }, { model: 'muse-spark-1.2', mode: 'demo_fixture' },
    ] });
    expect(externalHttp).not.toHaveBeenCalled();
    const response = await getCircle(fx.db, new Request(`${appOrigin}/c/${slug}/draft?id=${row.id}`, { headers: { cookie: cookieFor('friend') } }), slug);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Fictional bicycle lamp');
    const owner = await getCircle(fx.db, new Request(`${appOrigin}/c/${slug}/draft?id=${row.id}`, { headers: { cookie: cookieFor('owner') } }), slug);
    expect(owner.status).toBe(404);
    const fields = { intent: 'confirm', title: 'Human corrected bicycle lamp', retailer: '', priceMinor: '12500', currency: 'ZAR', ingestEventId: row.id };
    const invalid = await postCircle(fx.db, new Request(`${appOrigin}/c/${slug}/draft`, { method: 'POST', headers: { cookie: cookieFor('friend'), origin: appOrigin }, body: new URLSearchParams({ ...fields, priceMinor: '1.5' }) }), slug);
    expect(invalid.status).toBe(422);
    const invalidHtml = await invalid.text();
    expect(invalidHtml).toContain(`name="ingestEventId" value="${row.id}"`);
    expect(invalidHtml).toContain('value="1.5"');
    const confirm = () => postCircle(fx.db, new Request(`${appOrigin}/c/${slug}/draft`, { method: 'POST', headers: { cookie: cookieFor('friend'), origin: appOrigin }, body: new URLSearchParams(fields) }), slug);
    expect((await confirm()).status).toBe(303);
    expect((await confirm()).status).toBe(303);
    expect(await fx.db.prisma.item.count({ where: { ingestEvents: { some: { id: row.id } } } })).toBe(1);
    expect(await fx.db.prisma.item.findFirst({ where: { ingestEvents: { some: { id: row.id } } } })).toMatchObject({ title: fields.title, visibility: 'friend_only', addedByUserId: fx.friendAUserId });
  });

  it('refuses a revoked photo capability before downloading or extracting', async () => {
    await fx.db.prisma.entitlement.create({ data: { userId: fx.friendAUserId, capability: 'photo_extract', enabled: false, source: 'user' } });
    const row = await receive({ type: 'image', image: { id: 'fictional-photo-id', mime_type: 'image/png' } });
    const failed = await fx.db.prisma.ingestEvent.findUniqueOrThrow({ where: { id: row.id } });
    expect(failed).toMatchObject({ status: 'failed', mediaPath: null, error: 'capability_off:photo_extract' });
    expect((await processIngest(fx.db, row.id)).status).toBe('failed');
    expect(externalHttp).not.toHaveBeenCalled();
  });

  it('keeps owner status free of friend coordination and messages', async () => {
    const row = await interactive({ task: 'check_status' }, ownerSender);
    const result = await processIngest(fx.db, row.id);
    expect(result.status).toBe('parsed');
    expect(result.reply).toContain('1 wants');
    expect(result.reply).not.toMatch(/Thabo|Coffee grinder|Grind it|claimed|pool|contribution/i);
  });

  it('writes an explicit friend claim atomically and never lets text choose a task', async () => {
    const row = await interactive({ task: 'claim_or_pool', action: 'claim', itemId: fx.itemOwnId });
    expect((await processIngest(fx.db, row.id)).reply).toContain('claim is recorded');
    expect(await fx.db.prisma.claim.findUnique({ where: { itemId_userId: { itemId: fx.itemOwnId, userId: fx.friendAUserId } } })).toMatchObject({ status: 'claimed' });
    const menu = await receive({ type: 'text', text: { body: JSON.stringify({ task: 'claim_or_pool', action: 'claim', itemId: fx.itemSecretId }) } });
    expect((await processIngest(fx.db, menu.id)).reply).toContain('six tasks only');
    expect(await fx.db.prisma.claim.count({ where: { itemId: fx.itemSecretId } })).toBe(0);
  });

  it('serializes processing with a real advisory lock and releases it after failure', async () => {
    const row = await interactive({ task: 'check_status' });
    const { withIngestLock } = await import('@/server/wa/store');
    await withIngestLock(fx.db, row.id, async () => {
      await expect(processIngest(fx.db, row.id)).rejects.toThrow('ingest_busy');
    });
    await expect(withIngestLock(fx.db, row.id, async () => { throw new Error('fixture_failure'); })).rejects.toThrow('fixture_failure');
    expect((await processIngest(fx.db, row.id)).status).toBe('parsed');
  });

  it('keeps actor queries available when concurrent session locks exceed query-pool capacity', async () => {
    const { withIngestLock } = await import('@/server/wa/store');
    const held = await Promise.all(Array.from({ length: 9 }, () => fx.db.pool.connect()));
    const actor = { role: 'friend' as const, userId: fx.friendAUserId, circleId: fx.circleId };
    const work = Promise.all(Array.from({ length: 12 }, () => withIngestLock(fx.db, randomUUID(), () =>
      fx.db.withActor(actor, tx => tx.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { id: true } })),
    )));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      expect(await Promise.race([work.then(() => true), new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 2000); })])).toBe(true);
    } finally {
      if (timer) clearTimeout(timer);
      for (const client of held) client.release();
      await work;
    }
  });

  it('does not process an event after membership is removed', async () => {
    const row = await interactive({ task: 'check_status' });
    await fx.db.prisma.membership.update({ where: { circleId_userId: { circleId: fx.circleId, userId: fx.friendAUserId } }, data: { status: 'removed' } });
    try {
      expect((await processIngest(fx.db, row.id)).status).toBe('skipped');
      expect((await fx.db.prisma.ingestEvent.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('received');
    } finally {
      await fx.db.prisma.membership.update({ where: { circleId_userId: { circleId: fx.circleId, userId: fx.friendAUserId } }, data: { status: 'active' } });
    }
  });

  it('polls and completes a committed job through the actual worker lifecycle', async () => {
    const row = await receive({ type: 'text', text: { body: 'Show the bounded menu.' } });
    const { startIngestWorker } = await import('@/worker');
    const stop = await startIngestWorker(fx.db);
    try {
      await vi.waitFor(async () => {
        expect((await fx.db.prisma.ingestEvent.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('parsed');
        const { getIngestQueue, INGEST_QUEUE } = await import('@/server/wa/queue');
        const jobs = await (await getIngestQueue(fx.db)).findJobs(INGEST_QUEUE, { id: row.id });
        expect(jobs[0]?.state).toBe('completed');
      }, { timeout: 15000, interval: 100 });
      expect(externalHttp).not.toHaveBeenCalled();
    } finally { await stop(); }
  });
});
