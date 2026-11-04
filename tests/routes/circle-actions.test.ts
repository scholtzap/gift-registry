import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handleCircleGet, handleCirclePost } from '@/server/routes/circle';
import { claimIdempotencyKey } from '@/server/auth/idempotency';
import { issueSession, SESSION_COOKIE } from '@/server/auth/session';
import { env } from '@/lib/env';
import { seedCircle, type CircleFixture } from '../leak/fixtures';

let fx: CircleFixture;
let slug: string;
beforeAll(async () => {
  fx = await seedCircle(process.env.DATABASE_URL_TEST!);
  slug = (await fx.db.prisma.circle.findUniqueOrThrow({ where: { id: fx.circleId } })).shareSlug;
});
afterAll(async () => { await fx?.db.disconnect(); });
const origin = new URL(env.CIRCLE_BASE_URL).origin;
function cookie(role: 'owner' | 'friend', userId = role === 'owner' ? fx.ownerUserId : fx.friendAUserId) {
  return `${SESSION_COOKIE}=${issueSession({ role, userId, circleId: fx.circleId })}`;
}
function get(path: string, auth = cookie('friend')) {
  return handleCircleGet(fx.db, new Request(`${origin}/c/${slug}${path}`, { headers: { cookie: auth } }), slug);
}
function post(path: string, fields: Record<string, string>, auth = cookie('friend'), from = origin) {
  return handleCirclePost(fx.db, new Request(`${origin}/c/${slug}${path}`, {
    method: 'POST', headers: { cookie: auth, origin: from, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  }), slug);
}

describe('private circle actions', () => {
  it('404s unknown subpaths instead of rendering a ledger', async () => {
    expect((await get('/unknown')).status).toBe(404);
  });
  it('does not turn private subpaths into a login form', async () => {
    const response = await get('/draft', '');
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('Trail runners');
  });
  it('renders manual entry for each authenticated projection', async () => {
    for (const role of ['owner', 'friend'] as const) {
      const response = await get('/draft', cookie(role));
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('Confirm and add item');
      expect(response.headers.get('Cache-Control')).toContain('no-store');
    }
  });
  it('renders the friend item action screen', async () => {
    const response = await get(`/items/${fx.itemOwnId}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('I’ll buy it myself');
  });
  it('never hands friend item state to an owner wearing a friend cookie', async () => {
    const response = await get(`/items/${fx.itemOwnId}`, cookie('friend', fx.ownerUserId));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Your wish');
    expect(html).not.toMatch(/pool|claimed|contribut|Thabo|Lerato/i);
  });
  it('hides a friend-only suggestion from the owner item route', async () => {
    const response = await get(`/items/${fx.itemSecretId}`, cookie('owner'));
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(await response.text()).toContain('not valid');
  });
  it('renders an owner-only item detail without coordination state', async () => {
    const response = await get(`/items/${fx.itemOwnId}`, cookie('owner'));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Your wish');
    expect(html).toContain('Trail runners');
    expect(html).not.toMatch(/pool|claimed|contribut|Thabo|Lerato/i);
  });
  it('refuses another circle item', async () => {
    expect((await get('/items/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });
  it('updates only the actor capability setting', async () => {
    const response = await post('/settings', { intent: 'toggle', capability: 'voice_transcribe', enabled: 'false', userId: fx.friendBUserId });
    expect(response.status).toBe(303);
    const row = await fx.db.prisma.entitlement.findUnique({ where: { userId_capability: { userId: fx.friendAUserId, capability: 'voice_transcribe' } } });
    expect(row?.enabled).toBe(false);
    expect(await fx.db.prisma.entitlement.findUnique({ where: { userId_capability: { userId: fx.friendBUserId, capability: 'voice_transcribe' } } })).toBeNull();
  });
  it('rejects unsupported capability names and malformed booleans', async () => {
    for (const fields of [
      { intent: 'toggle', capability: 'not_a_capability', enabled: 'true' },
      { intent: 'toggle', capability: 'card_pun', enabled: 'yes' },
    ]) expect((await post('/settings', fields)).status).toBe(422);
  });
  it('rejects cross-origin and opaque-origin mutations without changing settings', async () => {
    for (const from of ['https://untrusted.example.test', 'null']) {
      const response = await post('/settings', { intent: 'toggle', capability: 'card_pun', enabled: 'false' }, cookie('friend'), from);
      expect(response.status).toBe(404);
      expect(await fx.db.prisma.entitlement.findUnique({ where: { userId_capability: { userId: fx.friendAUserId, capability: 'card_pun' } } })).toBeNull();
    }
    expect((await get('/settings')).headers.get('Referrer-Policy')).toBe('same-origin');
  });
  it('renders a private card only for a gift giver', async () => {
    const response = await get(`/items/${fx.itemGoneId}/card`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Grind it fine, drink it slow.');
    expect(html).toContain('src="/card-preview.js"');
    expect(html).not.toMatch(/og:|twitter:|amountMinor/);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });
  it('returns identical owner/missing card responses on HTML and PNG surfaces', async () => {
    for (const suffix of ['/card', '/card/png']) {
      const existing = await get(`/items/${fx.itemGoneId}${suffix}`, cookie('owner'));
      const missing = await get(`/items/00000000-0000-4000-8000-000000000000${suffix}`, cookie('owner'));
      expect(existing.status).toBe(404);
      expect(await existing.text()).toBe(await missing.text());
      expect(existing.headers.get('Cache-Control')).toContain('no-store');
    }
  });
  it('renders a private PNG without cache or preview headers', async () => {
    const response = await get(`/items/${fx.itemGoneId}/card/png`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('Content-Disposition')).toContain('attachment');
    expect([...new Uint8Array(await response.arrayBuffer()).slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
  it('refuses an oversized form stream before changing a capability', async () => {
    const response = await post('/settings', { intent: 'toggle', capability: 'card_pun', enabled: 'false', padding: 'x'.repeat(16_384) });
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(await fx.db.prisma.entitlement.findUnique({ where: { userId_capability: { userId: fx.friendAUserId, capability: 'card_pun' } } })).toBeNull();
  });
  it('retains rejected literal card text without overwriting saved entries', async () => {
    const input = { intent: 'save_entry', displayNameShown: 'Thabo', message: '  https://example.test/gift  ', anonymous: 'false' };
    const response = await post(`/items/${fx.itemGoneId}/card`, input);
    expect(response.status).toBe(422);
    expect(await response.text()).toContain(input.message);
    const entry = await fx.db.prisma.cardEntry.findUniqueOrThrow({ where: { itemId_contributorUserId: { itemId: fx.itemGoneId, contributorUserId: fx.friendAUserId } } });
    expect(entry.message).toBe('Grind it fine, drink it slow.');
  });
  it('persists an edited card entry without rewriting other messages', async () => {
    const response = await post(`/items/${fx.itemGoneId}/card`, { intent: 'save_entry', displayNameShown: 'Thabo', message: '  <gift> & joy!  ', anonymous: 'false', contributorUserId: fx.friendBUserId });
    expect(response.status).toBe(303);
    const row = await fx.db.prisma.cardEntry.findUnique({ where: { itemId_contributorUserId: { itemId: fx.itemGoneId, contributorUserId: fx.friendAUserId } } });
    expect(row?.message).toBe('  <gift> & joy!  ');
    const other = await fx.db.prisma.cardEntry.findUnique({ where: { itemId_contributorUserId: { itemId: fx.itemGoneId, contributorUserId: fx.friendBUserId } } });
    expect(other?.message).toBe('Happy 30th!');
  });
  it('confirms a friend item privately and ignores a forged visibility field', async () => {
    const response = await post('/draft', { intent: 'confirm', title: 'A fictional picnic blanket', retailer: '', priceMinor: '0', currency: 'ZAR', visibility: 'owner_visible', userId: fx.ownerUserId });
    expect(response.status).toBe(303);
    const item = await fx.db.prisma.item.findFirstOrThrow({ where: { circleId: fx.circleId, title: 'A fictional picnic blanket' } });
    expect(item).toMatchObject({ addedByUserId: fx.friendAUserId, visibility: 'friend_only', priceMinor: 0, confirmed: true });
    expect(await (await get('', cookie('owner'))).text()).not.toContain(item.title);
    const events = await fx.db.withActor({ role: 'owner', userId: fx.ownerUserId, circleId: fx.circleId }, tx => tx.ledgerEvent.findMany({ where: { entityId: item.id } }));
    expect(events).toEqual([]);
  });
  it('rejects invalid cents and unsupported currency without adding an item', async () => {
    for (const fields of [{ priceMinor: '-1', currency: 'ZAR' }, { priceMinor: '1.5', currency: 'ZAR' }, { priceMinor: '10', currency: 'JPY' }]) {
      const response = await post('/draft', { intent: 'confirm', title: 'Rejected fictional gift', ...fields });
      expect(response.status).toBe(422);
    }
    expect(await fx.db.prisma.item.count({ where: { circleId: fx.circleId, title: 'Rejected fictional gift' } })).toBe(0);
  });
  it.each([
    ['ZAR', 'R 1 249,50'],
    ['USD', '$1,249.50'],
    ['EUR', '1249,50'],
    ['GBP', '£1249.5'],
  ])('reads a typed %s price as integer cents in that currency', async (currency, priceAmount) => {
    const title = `Typed ${currency} fictional gift`;
    expect((await post('/draft', { intent: 'confirm', title, priceAmount, currency })).status).toBe(303);
    const item = await fx.db.prisma.item.findFirstOrThrow({ where: { circleId: fx.circleId, title } });
    expect(item).toMatchObject({ priceMinor: 124950, currency });
  });
  it('rejects ambiguous typed amounts and echoes what was typed', async () => {
    for (const [priceAmount, currency] of [['1,250', 'ZAR'], ['1,25', 'USD'], ['12.345', 'USD'], ['R', 'ZAR'], ['-5', 'USD'], ['1e3', 'USD']]) {
      const response = await post('/draft', { intent: 'confirm', title: 'Ambiguous typed gift', priceAmount: priceAmount!, currency: currency! });
      expect(response.status).toBe(422);
      expect(await response.text()).toContain(`value="${priceAmount}"`);
    }
    expect(await fx.db.prisma.item.count({ where: { circleId: fx.circleId, title: 'Ambiguous typed gift' } })).toBe(0);
  });
  it('defaults a new item to US dollars when no currency is stored', async () => {
    const column = await fx.db.prisma.$queryRaw<{ column_default: string }[]>`
      SELECT column_default FROM information_schema.columns WHERE table_name = 'items' AND column_name = 'currency'`;
    expect(column[0]?.column_default).toContain('USD');
  });
  it('does not confirm another person\'s or a nonexistent ingest event', async () => {
    const response = await post('/draft', { intent: 'confirm', title: 'Not my draft', priceMinor: '', currency: 'ZAR', ingestEventId: crypto.randomUUID() });
    expect(response.status).toBe(404);
  });
  it('records and releases a native claim on an owner-authored item', async () => {
    const response = await post(`/items/${fx.itemOwnId}`, { intent: 'claim', userId: fx.friendBUserId });
    expect(response.status).toBe(303);
    const claim = await fx.db.prisma.claim.findUniqueOrThrow({ where: { itemId_userId: { itemId: fx.itemOwnId, userId: fx.friendAUserId } } });
    expect(claim.status).toBe('claimed');
    expect((await post(`/items/${fx.itemOwnId}`, { intent: 'claim' }, cookie('friend', fx.friendBUserId))).status).toBe(409);
    expect((await post(`/items/${fx.itemOwnId}`, { intent: 'release' })).status).toBe(303);
  });
  it('binds contribution, mark-paid and purchase commands to the item in the URL', async () => {
    for (const intent of ['contribute', 'mark_paid', 'purchase']) {
      const response = await post(`/items/${fx.itemOwnId}`, { intent, poolId: fx.poolId, amountMinor: '100', currency: 'USD' });
      expect(response.status).toBe(404);
    }
  });
  it('records a pool contribution and funds it without charging money', async () => {
    // A pool must use its item's currency; a mismatch is refused before anything is written.
    expect((await post(`/items/${fx.itemOwnId}`, { intent: 'create_pool', targetAmount: 'R 100', currency: 'ZAR' })).status).toBe(422);
    // The form posts a typed amount; integer cents stay accepted for callers that already send them.
    const response = await post(`/items/${fx.itemOwnId}`, { intent: 'create_pool', targetAmount: '$100', currency: 'USD' });
    expect(response.status).toBe(303);
    const pool = await fx.db.prisma.pool.findFirstOrThrow({ where: { itemId: fx.itemOwnId } });
    expect(pool).toMatchObject({ targetMinor: 10000, currency: 'USD' });
    expect((await post(`/items/${fx.itemOwnId}`, { intent: 'contribute', poolId: pool.id, amountMinor: '10000', currency: 'USD' })).status).toBe(303);
    expect((await post(`/items/${fx.itemOwnId}`, { intent: 'mark_paid', poolId: pool.id })).status).toBe(303);
    expect((await fx.db.prisma.pool.findUniqueOrThrow({ where: { id: pool.id } })).status).toBe('funded');
    const contribution = await fx.db.prisma.contribution.findUniqueOrThrow({ where: { poolId_userId: { poolId: pool.id, userId: fx.friendAUserId } } });
    expect(contribution.status).toBe('marked_paid');
  });

  describe('the party date', () => {
    const row = () => fx.db.prisma.circle.findUniqueOrThrow({ where: { id: fx.circleId } });
    const datePost = (fields: Record<string, string>, auth = cookie('friend')) =>
      post('/date', { intent: 'set_event_date', ...fields }, auth);

    it('is a POST route only: a GET on it 404s like any other unknown subpath', async () => {
      expect((await get('/date')).status).toBe(404);
      expect((await get('/date', cookie('owner'))).status).toBe(404);
    });

    it('rejects a malformed date with a re-rendered ledger that keeps the draft', async () => {
      const before = await row();
      for (const eventDate of ['2026-02-30', '18/11/2026', '2026-11-3', '', '2026-13-01', 'everything']) {
        const response = await datePost({ eventDate });
        expect(response.status).toBe(422);
        const html = await response.text();
        expect(html).toContain('Enter a real date, in the form 2026-12-05.');
        if (eventDate) expect(html).toContain(`value="${eventDate}"`);
      }
      expect((await row()).eventDate).toEqual(before.eventDate);
      expect((await row()).eventDateSetByUserId).toBe(fx.ownerUserId);
    });

    it('rejects a form without the intent it names', async () => {
      expect((await post('/date', { eventDate: '2027-01-09' })).status).toBe(404);
      expect((await row()).eventDate).toEqual(new Date('2026-12-05T00:00:00.000Z'));
    });

    it('writes the session actor as the writer, never a forged field', async () => {
      const response = await datePost({ eventDate: '2027-01-09', eventDateSetByUserId: fx.ownerUserId, userId: fx.ownerUserId });
      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe(`/c/${slug}`);
      const after = await row();
      expect(after.eventDate).toEqual(new Date('2027-01-09T00:00:00.000Z'));
      expect(after.eventDateSetByUserId).toBe(fx.friendAUserId);

      await datePost({ eventDate: '2026-12-05' }, cookie('owner'));
    });

    it('loses the date to the owner the turn a friend writes it, and stays visible to friends', async () => {
      expect((await datePost({ eventDate: '2026-12-12' })).status).toBe(303);
      const ownerHtml = await (await get('', cookie('owner'))).text();
      expect(ownerHtml).not.toMatch(/2026-12-12|Sat 12 Dec|<time\b|days to go/);
      expect(ownerHtml).toContain('Birthday: 3 Apr');

      const friendHtml = await (await get('')).text();
      expect(friendHtml).toContain('<time dateTime="2026-12-12">Sat 12 Dec</time>');

      expect((await datePost({ eventDate: '2026-12-05' }, cookie('owner'))).status).toBe(303);
      expect(await (await get('', cookie('owner'))).text()).toContain('Sat 5 Dec');
    });

    it('refuses a cross-origin write without moving the date', async () => {
      for (const from of ['https://untrusted.example.test', 'null']) {
        const response = await handleCirclePost(fx.db, new Request(`${origin}/c/${slug}/date`, {
          method: 'POST',
          headers: { cookie: cookie('owner'), origin: from, 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ intent: 'set_event_date', eventDate: '2027-02-14' }),
        }), slug);
        expect(response.status).toBe(404);
      }
      expect((await row()).eventDate).toEqual(new Date('2026-12-05T00:00:00.000Z'));
      expect((await row()).eventDateSetByUserId).toBe(fx.ownerUserId);
    });

    it('dedupes a double-submitted confirm with the same idempotency key (F8)', async () => {
      // Run-unique: the idempotency table lives in Postgres and outlives one run.
      const key = `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const fields = {
        intent: 'confirm', title: 'A fictional double-clicked kettle', retailer: '',
        priceMinor: '0', currency: 'ZAR', visibility: 'owner_visible',
        idempotencyKey: key,
      };
      const first = await post('/draft', fields);
      expect(first.status).toBe(303);
      const second = await post('/draft', fields);
      expect(second.status).toBe(303);
      expect(second.headers.get('Location')).toBe(`/c/${slug}`);
      expect(await fx.db.prisma.item.count({
        where: { circleId: fx.circleId, title: 'A fictional double-clicked kettle' },
      })).toBe(1);
    });

    it('treats the same key from another actor as a new write (F8 scope)', async () => {
      const key = `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const fields = {
        intent: 'confirm', title: 'A fictional scoped kettle', retailer: '',
        priceMinor: '0', currency: 'ZAR', visibility: 'owner_visible',
        idempotencyKey: key,
      };
      expect((await post('/draft', fields, cookie('friend'))).status).toBe(303);
      // friendB never confirmed anything: same key, different actor, proceeds.
      const other = await post('/draft', fields, cookie('friend', fx.friendBUserId));
      expect(other.status).toBe(303);
      expect(await fx.db.prisma.item.count({
        where: { circleId: fx.circleId, title: 'A fictional scoped kettle' },
      })).toBe(2);
    });

    it('lets exactly one of two concurrent first claims win (F8 race)', async () => {
      const key = `idem-race-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const [a, b] = await Promise.all([
        claimIdempotencyKey(fx.db, key, fx.circleId, fx.ownerUserId),
        claimIdempotencyKey(fx.db, key, fx.circleId, fx.ownerUserId),
      ]);
      expect([a, b].filter(Boolean)).toHaveLength(1);
    });
  });
});
