import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handleCircleGet, handleCirclePost } from '@/server/routes/circle';
import { issueSession, SESSION_COOKIE } from '@/server/auth/session';
import { env } from '@/lib/env';
import { formatMinor } from '@/lib/money';
import { keyedHash } from '@/server/auth/phone-hash';
import { PEPPER, seedCircle, type CircleFixture } from '../leak/fixtures';

/**
 * Payout details, the amounts-due share page, buyer mark-paid and the chip
 * regression: quick picks post whole-unit `pledgeAmount` values and must record
 * them like a typed amount does.
 */
let fx: CircleFixture;
let slug: string;
let poolId: string;
let currency: string;
let strangerUserId: string;
beforeAll(async () => {
  fx = await seedCircle(process.env.DATABASE_URL_TEST!);
  slug = (await fx.db.prisma.circle.findUniqueOrThrow({ where: { id: fx.circleId } })).shareSlug;
  // A joined friend with no pledge: the payout gate must hold for them.
  const stranger = await fx.db.prisma.user.create({ data: { bsuid: `stranger-payout-${Date.now()}`, displayName: 'Payout Stranger' } });
  strangerUserId = stranger.id;
  await fx.db.prisma.membership.create({ data: { circleId: fx.circleId, userId: stranger.id, role: 'friend' } });
  await fx.db.prisma.allowlistEntry.create({
    data: { circleId: fx.circleId, phoneE164Hash: keyedHash(`allowlist-token-${stranger.id}`, PEPPER), addedBy: fx.ownerUserId, status: 'accepted' },
  });
});
afterAll(async () => { await fx?.db.disconnect(); });
const origin = new URL(env.CIRCLE_BASE_URL).origin;
function cookie(role: 'owner' | 'friend', userId: string) {
  return `${SESSION_COOKIE}=${issueSession({ role, userId, circleId: fx.circleId })}`;
}
const friendA = () => cookie('friend', fx.friendAUserId);
const friendB = () => cookie('friend', fx.friendBUserId);
function get(path: string, auth: string) {
  return handleCircleGet(fx.db, new Request(`${origin}/c/${slug}${path}`, { headers: { cookie: auth } }), slug);
}
function post(path: string, fields: Record<string, string>, auth: string) {
  return handleCirclePost(fx.db, new Request(`${origin}/c/${slug}${path}`, {
    method: 'POST', headers: { cookie: auth, origin, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  }), slug);
}
const payoutFields = (over: Record<string, string> = {}) => ({
  intent: 'save_payout',
  poolId,
  accountHolder: 'Thabo Nkosi',
  bankName: 'Fictional Bank',
  accountNumber: '62345678901',
  branchCode: '123456',
  accountType: 'cheque',
  referencePrefix: 'GIFT',
  shareConsent: 'on',
  ...over,
});

describe('chip-in quick picks', () => {
  it('records whole-unit picks and the rest like typed amounts', async () => {
    expect(await post(`/items/${fx.itemOwnId}`, { intent: 'create_pool', targetAmount: '1000', currency: 'USD' }, friendA()).then((r) => r.status)).toBe(303);
    const pool = await fx.db.prisma.pool.findFirstOrThrow({ where: { itemId: fx.itemOwnId } });
    poolId = pool.id;
    currency = pool.currency;
    // Exactly what the R100 chip submits: name=pledgeAmount, whole units.
    const chip = await post(`/items/${fx.itemOwnId}`, { intent: 'contribute', poolId, currency, pledgeAmount: '100' }, friendA());
    expect(chip.status).toBe(303);
    await expect(fx.db.prisma.contribution.findUniqueOrThrow({ where: { poolId_userId: { poolId, userId: fx.friendAUserId } } }))
      .resolves.toMatchObject({ amountMinor: 10000, status: 'promised' });
    // "The rest" posts the exact remainder in whole units too.
    const rest = await post(`/items/${fx.itemOwnId}`, { intent: 'contribute', poolId, currency, pledgeAmount: '900' }, friendB());
    expect(rest.status).toBe(303);
    await expect(fx.db.prisma.contribution.findUniqueOrThrow({ where: { poolId_userId: { poolId, userId: fx.friendBUserId } } }))
      .resolves.toMatchObject({ amountMinor: 90000, status: 'promised' });
  });
});

describe('buyer payout details', () => {
  it('rejects malformed bank details with a 422 and writes nothing', async () => {
    const bad = await post(`/items/${fx.itemOwnId}`, payoutFields({ accountNumber: 'not-a-number' }), friendA());
    expect(bad.status).toBe(422);
    expect(await fx.db.prisma.poolPayout.count({ where: { poolId } })).toBe(0);
  });

  it('refuses a non-buyer save without revealing the pool', async () => {
    const forged = await post(`/items/${fx.itemOwnId}`, payoutFields(), friendB());
    expect(forged.status).toBe(404);
    expect(await fx.db.prisma.poolPayout.count({ where: { poolId } })).toBe(0);
  });

  it('saves the buyer row, hidden from pledgers until sharing is on', async () => {
    const { shareConsent: _dropped, ...withoutConsent } = payoutFields();
    expect((await post(`/items/${fx.itemOwnId}`, withoutConsent, friendA())).status).toBe(303);
    const row = await fx.db.prisma.poolPayout.findUniqueOrThrow({ where: { poolId } });
    expect(row).toMatchObject({ buyerUserId: fx.friendAUserId, accountNumber: '62345678901', branchCode: '123456', shareConsent: false });
    // A pledger sees nothing and the share page 404s while sharing is off.
    expect((await get(`/items/${fx.itemOwnId}/pay`, friendB())).status).toBe(404);
    expect(await get(`/items/${fx.itemOwnId}`, friendB()).then((r) => r.text())).not.toContain('62345678901');
    // Switching sharing on reveals the details to pledgers only.
    expect((await post(`/items/${fx.itemOwnId}`, payoutFields(), friendA())).status).toBe(303);
    expect(await fx.db.prisma.poolPayout.findUniqueOrThrow({ where: { poolId } })).toMatchObject({ shareConsent: true });
  });

  it('shows a joined stranger neither details nor the share page', async () => {
    const strangerAuth = cookie('friend', strangerUserId);
    expect((await get(`/items/${fx.itemOwnId}/pay`, strangerAuth)).status).toBe(404);
    expect(await get(`/items/${fx.itemOwnId}`, strangerAuth).then((r) => r.text())).not.toContain('62345678901');
  });

  it('renders the share page with bank details, amounts due and references', async () => {
    const response = await get(`/items/${fx.itemOwnId}/pay`, friendB());
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('62345678901');
    expect(html).toContain('Fictional Bank');
    expect(html).toContain('wa.me');
    const contribution = await fx.db.prisma.contribution.findUniqueOrThrow({ where: { poolId_userId: { poolId, userId: fx.friendBUserId } } });
    const reference = `GIFT-${contribution.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
    expect(html).toContain(reference);
    expect(html).toContain(formatMinor(90000, currency));
  });
});

describe('marking another pledger paid', () => {
  it('lets the buyer confirm a pledger, and nobody else', async () => {
    expect((await post(`/items/${fx.itemOwnId}`, { intent: 'mark_paid', poolId, userId: fx.friendBUserId }, friendA())).status).toBe(303);
    await expect(fx.db.prisma.contribution.findUniqueOrThrow({ where: { poolId_userId: { poolId, userId: fx.friendBUserId } } }))
      .resolves.toMatchObject({ status: 'marked_paid' });
    // A non-buyer naming someone else reads exactly like nothing.
    expect((await post(`/items/${fx.itemOwnId}`, { intent: 'mark_paid', poolId, userId: fx.friendAUserId }, friendB())).status).toBe(404);
    // Self-mark keeps working with or without the field.
    expect((await post(`/items/${fx.itemOwnId}`, { intent: 'mark_paid', poolId }, friendB())).status).toBe(303);
  });
});

describe('the owner stays blind to payout state', () => {
  it('reads no payout row, pledge or reference on any owner surface', async () => {
    const ownerAuth = cookie('owner', fx.ownerUserId);
    expect((await get(`/items/${fx.itemOwnId}/pay`, ownerAuth)).status).toBe(404);
    const html = await get(`/items/${fx.itemOwnId}`, ownerAuth).then((r) => r.text());
    for (const secret of ['62345678901', 'Fictional Bank', 'GIFT-', 'Thabo Nkosi']) {
      expect(html).not.toContain(secret);
    }
  });
});
