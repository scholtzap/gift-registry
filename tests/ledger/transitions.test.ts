import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor, Db } from '@/server/db/client';
import { addItem, claimItem, contribute, createCircle, createPool, markPaid, purchasePool, releaseClaim, tombstoneItem } from '@/server/ledger';
import { friendCircleView, ownerCircleView } from '@/server/views';
import { seedCircle, type CircleFixture } from '../leak/fixtures';

let fx: CircleFixture;
let db: Db;

beforeAll(async () => {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  fx = await seedCircle(url);
  db = fx.db;
});

afterAll(async () => {
  try {
    if (fx) {
      await db.prisma.user.deleteMany({ where: { id: { in: [
        fx.ownerUserId, fx.friendAUserId, fx.friendBUserId, fx.outsiderUserId,
      ] } } });
    }
  } finally {
    await db?.disconnect();
  }
});

const owner = (): Actor => ({ role: 'owner', userId: fx.ownerUserId, circleId: fx.circleId });
const friend = (userId = fx.friendAUserId): Actor => ({ role: 'friend', userId, circleId: fx.circleId });

async function wantedItem() {
  const actor = owner();
  return db.withActor(actor, (tx) => addItem(tx, actor, {
    title: 'Cycling shoes in the right size', currency: 'ZAR', priceMinor: 10000,
  }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('ledger transitions through actor-scoped transactions', () => {
  it('claims an owner-authored item once without UPDATE permission or changing the owner projection', async () => {
    const before = await db.withActor(owner(), (tx) => ownerCircleView(tx, fx.circleId));
    const eventsBefore = await db.withActor(owner(), (tx) => tx.ledgerEvent.findMany({ orderBy: { id: 'asc' } }));
    const actor = friend();
    expect(await db.withActor(actor, (tx) => tx.item.updateMany({
      where: { id: fx.itemOwnId }, data: { title: 'Not permitted' },
    }))).toEqual({ count: 0 });
    const claim = await db.withActor(actor, (tx) => claimItem(tx, actor, fx.itemOwnId));
    const retry = await db.withActor(actor, (tx) => claimItem(tx, actor, fx.itemOwnId));

    expect(claim).toMatchObject({ itemId: fx.itemOwnId, userId: actor.userId, kind: 'solo', status: 'claimed' });
    expect(retry.id).toBe(claim.id);
    const view = await db.withActor(actor, (tx) => friendCircleView(tx, fx.circleId, actor.userId));
    expect(view?.items.find((item) => item.id === fx.itemOwnId)?.claimedByMe).toBe(true);
    expect(await db.withActor(owner(), (tx) => ownerCircleView(tx, fx.circleId))).toEqual(before);
    expect(await db.withActor(owner(), (tx) => tx.ledgerEvent.findMany({ orderBy: { id: 'asc' } }))).toEqual(eventsBefore);
    expect(await db.withActor(actor, (tx) => tx.ledgerEvent.count({
      where: { entity: 'claim', entityId: claim.id, action: 'claim.claimed' },
    }))).toBe(1);
  });

  it('allows exactly one of two simultaneous competing friends to claim an owner item', async () => {
    const item = await wantedItem();
    const actors = [friend(), friend(fx.friendBUserId)] as const;
    const results = await Promise.allSettled(actors.map((actor) =>
      db.withActor(actor, (tx) => claimItem(tx, actor, item.id))));
    const won = results.filter((result) => result.status === 'fulfilled');
    const lost = results.filter((result) => result.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0]!.reason).toMatchObject({ message: 'ledger_item_reserved' });
    const winningClaim = won[0]!.value;
    expect(await db.withActor(actors[0], (tx) => tx.claim.findMany({ where: { itemId: item.id } })))
      .toEqual([winningClaim]);
    expect(await db.withActor(actors[0], (tx) => tx.ledgerEvent.count({
      where: { entityId: winningClaim.id, action: 'claim.claimed' },
    }))).toBe(1);
    const winner = friend(winningClaim.userId);
    const loser = actors.find((actor) => actor.userId !== winner.userId)!;
    await expect(db.withActor(loser, (tx) => releaseClaim(tx, loser, item.id))).rejects.toThrow('ledger_not_found');
    await db.withActor(winner, (tx) => releaseClaim(tx, winner, item.id));
    expect(await db.withActor(loser, (tx) => claimItem(tx, loser, item.id)))
      .toMatchObject({ itemId: item.id, userId: loser.userId, status: 'claimed' });
  });

  it('serializes simultaneous solo claim and pool creation behind the same owner-item lock', async () => {
    const item = await wantedItem();
    const solo = friend();
    const buyer = friend(fx.friendBUserId);
    const results = await Promise.allSettled([
      db.withActor(solo, (tx) => claimItem(tx, solo, item.id)),
      db.withActor(buyer, (tx) => createPool(tx, buyer, item.id, 10000)),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toMatchObject([
      { reason: { message: 'ledger_item_reserved' } },
    ]);
    const claims = await db.withActor(solo, (tx) => tx.claim.findMany({ where: { itemId: item.id } }));
    const pools = await db.withActor(solo, (tx) => tx.pool.findMany({ where: { itemId: item.id } }));
    expect(claims).toHaveLength(1);
    if (pools.length) {
      expect(pools).toHaveLength(1);
      expect(claims[0]).toMatchObject({ kind: 'pool_member', poolId: pools[0]!.id });
    } else {
      expect(claims[0]).toMatchObject({ kind: 'solo', poolId: null });
    }
  });

  it('serializes duplicate claims and releases only once, allowing the same claim to be reused', async () => {
    const item = await wantedItem();
    const actor = friend();
    const [first, retry] = await Promise.all([
      db.withActor(actor, (tx) => claimItem(tx, actor, item.id)),
      db.withActor(actor, (tx) => claimItem(tx, actor, item.id)),
    ]);
    expect(first.id).toBe(retry.id);
    expect(await db.withActor(actor, (tx) => releaseClaim(tx, actor, item.id)))
      .toMatchObject({ id: first.id, status: 'released' });
    expect(await db.withActor(actor, (tx) => releaseClaim(tx, actor, item.id)))
      .toMatchObject({ id: first.id, status: 'released' });
    expect(await db.withActor(actor, (tx) => claimItem(tx, actor, item.id)))
      .toMatchObject({ id: first.id, status: 'claimed' });
    expect(await db.withActor(actor, (tx) => tx.ledgerEvent.count({
      where: { entityId: first.id, action: 'claim.released' },
    }))).toBe(1);
  });

  it('cannot pool a solo claim; after release, opens one pool and reserves the buyer claim', async () => {
    const item = await wantedItem();
    const actor = friend();
    await db.withActor(actor, (tx) => claimItem(tx, actor, item.id));
    await expect(db.withActor(actor, (tx) => createPool(tx, actor, item.id, 10000)))
      .rejects.toThrow('ledger_item_reserved');
    await db.withActor(actor, (tx) => releaseClaim(tx, actor, item.id));
    const [pool, retry] = await Promise.all([
      db.withActor(actor, (tx) => createPool(tx, actor, item.id, 10000)),
      db.withActor(actor, (tx) => createPool(tx, actor, item.id, 10000)),
    ]);
    expect(pool).toMatchObject({ itemId: item.id, targetMinor: 10000, currency: 'ZAR', status: 'open', buyerUserId: actor.userId });
    expect(retry.id).toBe(pool.id);
    await expect(db.withActor(actor, (tx) => claimItem(tx, actor, item.id))).rejects.toThrow('ledger_item_reserved');
    expect(await db.withActor(actor, (tx) => tx.claim.findUnique({
      where: { itemId_userId: { itemId: item.id, userId: actor.userId } },
    }))).toMatchObject({ kind: 'pool_member', poolId: pool.id, status: 'claimed' });
    expect(await db.withActor(actor, (tx) => tx.ledgerEvent.count({
      where: { entityId: pool.id, action: 'pool.opened' },
    }))).toBe(1);
  });

  it('records one promise per friend under a pool lock, not a client-funded total', async () => {
    const item = await wantedItem();
    const buyer = friend();
    const contributor = friend(fx.friendBUserId);
    const pool = await db.withActor(buyer, (tx) => createPool(tx, buyer, item.id, 10000));
    const [first, retry] = await Promise.all([
      db.withActor(contributor, (tx) => contribute(tx, contributor, pool.id, 6000)),
      db.withActor(contributor, (tx) => contribute(tx, contributor, pool.id, 6000)),
    ]);
    expect(first).toMatchObject({ poolId: pool.id, userId: contributor.userId, amountMinor: 6000, currency: 'ZAR', status: 'promised' });
    expect(retry.id).toBe(first.id);
    await db.withActor(buyer, (tx) => contribute(tx, buyer, pool.id, 4000));
    expect(await db.withActor(buyer, (tx) => tx.pool.findUnique({ where: { id: pool.id } })))
      .toMatchObject({ status: 'open' });
    await expect(db.withActor(contributor, (tx) => contribute(tx, contributor, pool.id, 7000)))
      .rejects.toThrow('ledger_contribution_conflict');
    expect(await db.withActor(buyer, (tx) => tx.ledgerEvent.count({
      where: { entityId: first.id, action: 'contribution.promised' },
    }))).toBe(1);
    expect(await db.withActor(contributor, (tx) => tx.claim.findUnique({
      where: { itemId_userId: { itemId: item.id, userId: contributor.userId } },
    }))).toMatchObject({ kind: 'pool_member', status: 'claimed', poolId: pool.id });
  });

  it('funds from privately marked-paid contributions and emits one funding event on concurrent retries', async () => {
    const item = await wantedItem();
    const buyer = friend();
    const contributor = friend(fx.friendBUserId);
    const pool = await db.withActor(buyer, (tx) => createPool(tx, buyer, item.id, 10000));
    await db.withActor(buyer, (tx) => contribute(tx, buyer, pool.id, 4000));
    await db.withActor(contributor, (tx) => contribute(tx, contributor, pool.id, 6000));
    const partial = await db.withActor(buyer, (tx) => markPaid(tx, buyer, pool.id));
    expect(partial.pool.status).toBe('open');
    expect(partial.contribution).toMatchObject({ status: 'marked_paid', amountMinor: 4000 });
    const [funded, retry] = await Promise.all([
      db.withActor(contributor, (tx) => markPaid(tx, contributor, pool.id)),
      db.withActor(contributor, (tx) => markPaid(tx, contributor, pool.id)),
    ]);
    expect(funded.pool.status).toBe('funded');
    expect(retry.contribution.id).toBe(funded.contribution.id);
    expect(funded.contribution.paidAt).toBeInstanceOf(Date);
    expect(await db.withActor(buyer, (tx) => tx.ledgerEvent.count({
      where: { entityId: pool.id, action: 'pool.funded' },
    }))).toBe(1);
    expect(await db.withActor(buyer, (tx) => tx.ledgerEvent.count({
      where: { entityId: funded.contribution.id, action: 'contribution.marked_paid' },
    }))).toBe(1);
  });

  it('funds once when two different friends mark paid simultaneously while the owner stays blind', async () => {
    const item = await wantedItem();
    const buyer = friend();
    const contributor = friend(fx.friendBUserId);
    const before = await db.withActor(owner(), (tx) => ownerCircleView(tx, fx.circleId));
    const eventsBefore = await db.withActor(owner(), (tx) => tx.ledgerEvent.findMany({ orderBy: { id: 'asc' } }));
    const pool = await db.withActor(buyer, (tx) => createPool(tx, buyer, item.id, 10000));
    await Promise.all([
      db.withActor(buyer, (tx) => contribute(tx, buyer, pool.id, 4000)),
      db.withActor(contributor, (tx) => contribute(tx, contributor, pool.id, 6000)),
    ]);
    const paid = await Promise.all([
      db.withActor(buyer, (tx) => markPaid(tx, buyer, pool.id)),
      db.withActor(contributor, (tx) => markPaid(tx, contributor, pool.id)),
    ]);
    expect(paid.map((result) => result.pool.status).sort()).toEqual(['funded', 'open']);
    expect(paid.every((result) => result.contribution.status === 'marked_paid')).toBe(true);
    expect(await db.withActor(buyer, (tx) => tx.pool.findUnique({ where: { id: pool.id } })))
      .toMatchObject({ status: 'funded' });
    expect(await db.withActor(buyer, (tx) => tx.ledgerEvent.count({
      where: { entityId: pool.id, action: 'pool.funded' },
    }))).toBe(1);
    expect(await db.withActor(owner(), (tx) => tx.pool.findUnique({ where: { id: pool.id } }))).toBeNull();
    expect(await db.withActor(owner(), (tx) => tx.claim.count({ where: { itemId: item.id } }))).toBe(0);
    expect(await db.withActor(owner(), (tx) => tx.contribution.count({ where: { poolId: pool.id } }))).toBe(0);
    expect(await db.withActor(owner(), (tx) => tx.ledgerEvent.findMany({ orderBy: { id: 'asc' } }))).toEqual(eventsBefore);
    expect(await db.withActor(owner(), (tx) => ownerCircleView(tx, fx.circleId))).toEqual(before);
  });

  it('lets only the buyer purchase a funded pool, settling real payments and fulfilling its claim once', async () => {
    const item = await wantedItem();
    const buyer = friend();
    const pool = await db.withActor(buyer, (tx) => createPool(tx, buyer, item.id, 10000));
    await expect(db.withActor(buyer, (tx) => purchasePool(tx, buyer, pool.id)))
      .rejects.toThrow('ledger_pool_unavailable');
    await db.withActor(buyer, (tx) => contribute(tx, buyer, pool.id, 10000));
    await db.withActor(buyer, (tx) => markPaid(tx, buyer, pool.id));
    const nonBuyer = friend(fx.friendBUserId);
    await expect(db.withActor(nonBuyer, (tx) => purchasePool(tx, nonBuyer, pool.id)))
      .rejects.toThrow('ledger_buyer_required');
    const [purchased, retry] = await Promise.all([
      db.withActor(buyer, (tx) => purchasePool(tx, buyer, pool.id)),
      db.withActor(buyer, (tx) => purchasePool(tx, buyer, pool.id)),
    ]);
    expect(purchased).toMatchObject({ status: 'purchased', id: pool.id });
    expect(retry.id).toBe(pool.id);
    expect(await db.withActor(buyer, (tx) => tx.contribution.findMany({ where: { poolId: pool.id } })))
      .toMatchObject([{ amountMinor: 10000, status: 'settled' }]);
    expect(await db.withActor(buyer, (tx) => tx.claim.findMany({ where: { poolId: pool.id } })))
      .toMatchObject([{ status: 'fulfilled' }]);
    expect(await db.withActor(buyer, (tx) => tx.ledgerEvent.count({
      where: { entityId: pool.id, action: 'pool.purchased' },
    }))).toBe(1);
  });

  it('blocks group purchase before mutation when RLS cannot fulfill another contributor claim', async () => {
    const item = await wantedItem();
    const buyer = friend();
    const contributor = friend(fx.friendBUserId);
    const pool = await db.withActor(buyer, (tx) => createPool(tx, buyer, item.id, 10000));
    await db.withActor(contributor, (tx) => contribute(tx, contributor, pool.id, 10000));
    await db.withActor(contributor, (tx) => markPaid(tx, contributor, pool.id));
    await expect(db.withActor(buyer, (tx) => purchasePool(tx, buyer, pool.id)))
      .rejects.toThrow('ledger_policy_blocked:purchase_claims');
    expect(await db.withActor(buyer, (tx) => tx.pool.findUnique({ where: { id: pool.id } })))
      .toMatchObject({ status: 'funded' });
    expect(await db.withActor(buyer, (tx) => tx.contribution.findMany({ where: { poolId: pool.id } })))
      .toMatchObject([{ status: 'marked_paid' }]);
    expect(await db.withActor(buyer, (tx) => tx.claim.count({ where: { poolId: pool.id, status: 'claimed' } }))).toBe(2);
    expect(await db.withActor(buyer, (tx) => tx.ledgerEvent.count({ where: { entityId: pool.id, action: 'pool.purchased' } }))).toBe(0);
  });

  it('human-confirms an owner draft once with a locked ingest event and owner-only visibility choice', async () => {
    const actor = owner();
    const ingest = await db.prisma.ingestEvent.create({ data: {
      circleId: fx.circleId, userId: actor.userId, waMessageId: `ledger-${crypto.randomUUID()}`,
      kind: 'text', status: 'parsed', draft: { title: 'Coffee cup' },
    } });
    const input = { title: 'Coffee cup', retailer: 'Fictional retailer', priceMinor: 15000, currency: 'ZAR', ingestEventId: ingest.id };
    const [item, retry] = await Promise.all([
      db.withActor(actor, (tx) => addItem(tx, actor, input)),
      db.withActor(actor, (tx) => addItem(tx, actor, input)),
    ]);
    expect(item).toMatchObject({ title: 'Coffee cup', priceMinor: 15000, currency: 'ZAR', visibility: 'owner_visible', confirmed: true });
    expect(retry.id).toBe(item.id);
    expect(await db.withActor(actor, (tx) => tx.ingestEvent.findUnique({ where: { id: ingest.id } })))
      .toMatchObject({ status: 'confirmed', itemId: item.id });
    expect(await db.withActor(actor, (tx) => tx.ledgerEvent.count({ where: { entityId: item.id, action: 'item.added' } }))).toBe(1);
    const view = await db.withActor(actor, (tx) => ownerCircleView(tx, fx.circleId));
    expect(view?.items.find((entry) => entry.id === item.id)?.confirmed).toBe(true);
  });

  it('adds a friend-only suggestion and its real ledger event without exposing either to the owner', async () => {
    const actor = friend(fx.friendBUserId);
    const before = await db.withActor(owner(), (tx) => ownerCircleView(tx, fx.circleId));
    const eventsBefore = await db.withActor(owner(), (tx) => tx.ledgerEvent.findMany({ orderBy: { id: 'asc' } }));
    const ingest = await db.prisma.ingestEvent.create({ data: {
      circleId: fx.circleId, userId: actor.userId, waMessageId: `ledger-${crypto.randomUUID()}`,
      kind: 'text', status: 'parsed', draft: { title: 'A surprise from the group' },
    } });
    const input = { title: 'A surprise from the group', priceMinor: 0, ingestEventId: ingest.id };
    const [item, retry] = await Promise.all([
      db.withActor(actor, (tx) => addItem(tx, actor, input)),
      db.withActor(actor, (tx) => addItem(tx, actor, input)),
    ]);
    expect(item).toMatchObject({ addedByUserId: actor.userId, priceMinor: 0, visibility: 'friend_only', confirmed: true });
    expect(retry.id).toBe(item.id);
    const events = await db.withActor(actor, (tx) => tx.ledgerEvent.findMany({
      where: { entity: 'item', entityId: item.id, action: 'item.added' },
    }));
    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.actorUserId).toBe(actor.userId);
    expect(await db.withActor(owner(), (tx) => tx.ledgerEvent.findUnique({ where: { id: event.id } }))).toBeNull();
    expect(await db.withActor(owner(), (tx) => tx.ledgerEvent.findMany({ orderBy: { id: 'asc' } }))).toEqual(eventsBefore);
    expect(await db.withActor(owner(), (tx) => tx.item.findUnique({ where: { id: item.id } }))).toBeNull();
    expect(await db.withActor(owner(), (tx) => ownerCircleView(tx, fx.circleId))).toEqual(before);
    const otherFriend = friend();
    const view = await db.withActor(otherFriend, (tx) => friendCircleView(tx, fx.circleId, otherFriend.userId));
    expect(view?.items.find((entry) => entry.id === item.id)).toMatchObject({ title: input.title });
    expect(await db.withActor(otherFriend, (tx) => claimItem(tx, otherFriend, item.id)))
      .toMatchObject({ itemId: item.id, userId: otherFriend.userId, status: 'claimed' });
  });

  it('accepts zero item prices but rejects invalid prices and non-positive pool/contribution money', async () => {
    const asOwner = owner();
    const buyer = friend();
    const item = await wantedItem();
    expect(await db.withActor(asOwner, (tx) => addItem(tx, asOwner, { title: 'A zero-price gift', priceMinor: 0 })))
      .toMatchObject({ priceMinor: 0, currency: 'ZAR', confirmed: true });
    for (const value of [-1, 1.5, NaN, Infinity, 2147483648]) {
      await expect(db.withActor(asOwner, (tx) => addItem(tx, asOwner, { title: 'Manual item', priceMinor: value })))
        .rejects.toThrow('ledger_invalid_money');
    }
    for (const value of [0, -1, 1.5, NaN, Infinity, 2147483648]) {
      await expect(db.withActor(buyer, (tx) => createPool(tx, buyer, item.id, value)))
        .rejects.toThrow('ledger_invalid_money');
    }
    await expect(db.withActor(asOwner, (tx) => addItem(tx, asOwner, { title: 'Manual item', currency: 'USD' })))
      .rejects.toThrow('ledger_currency_unsupported');
    const pool = await db.withActor(buyer, (tx) => createPool(tx, buyer, item.id, 10000));
    for (const value of [0, -1, 1.5, NaN, Infinity, 2147483648]) {
      await expect(db.withActor(buyer, (tx) => contribute(tx, buyer, pool.id, value)))
        .rejects.toThrow('ledger_invalid_money');
    }
    expect(await db.withActor(buyer, (tx) => tx.contribution.count({ where: { poolId: pool.id } }))).toBe(0);
  });

  it('reports circle creation blocked by the missing owner-membership INSERT policy', async () => {
    await expect(db.withActor(owner(), (tx) => tx.membership.create({ data: {
      circleId: fx.circleId, userId: fx.outsiderUserId, role: 'owner',
    } }))).rejects.toThrow('row-level security');
    const actor: Actor = { ...owner(), circleId: null };
    const before = await db.withActor(actor, (tx) => tx.circle.count());
    await expect(db.withActor(actor, (tx) => createCircle(tx, actor, {
      name: 'A new celebration', occasion: 'birthday', eventDate: new Date('2027-01-15T00:00:00Z'),
      phoneHashes: ['a'.repeat(64)],
    }))).rejects.toThrow('ledger_policy_blocked:circle_membership');
    expect(await db.withActor(actor, (tx) => tx.circle.count())).toBe(before);
  });

  it('refuses an owner tombstone when the same transaction cannot pivot surviving pools', async () => {
    const actor = owner();
    expect(await db.withActor(actor, (tx) => tx.pool.updateMany({
      where: { id: fx.poolId }, data: { status: 'pivot_needed' },
    }))).toEqual({ count: 0 });
    const before = await db.withActor(actor, (tx) => ownerCircleView(tx, fx.circleId));
    const pool = await db.withActor(friend(), (tx) => tx.pool.findUnique({ where: { id: fx.poolId } }));
    await expect(db.withActor(actor, (tx) => tombstoneItem(tx, actor, fx.itemOwnId, 'bought_self')))
      .rejects.toThrow('ledger_policy_blocked:tombstone_pool_pivot');
    expect(await db.withActor(actor, (tx) => ownerCircleView(tx, fx.circleId))).toEqual(before);
    expect(await db.withActor(friend(), (tx) => tx.pool.findUnique({ where: { id: fx.poolId } }))).toEqual(pool);
    expect(await db.withActor(actor, (tx) => tx.ledgerEvent.count({
      where: { entityId: fx.itemOwnId, action: 'item.tombstoned' },
    }))).toBe(0);
  });

  it('denies owners posing as friends, removed or unrelated memberships, and mismatched actor arguments', async () => {
    const impersonator: Actor = { ...owner(), role: 'friend' };
    await expect(db.withActor(impersonator, (tx) => claimItem(tx, impersonator, fx.itemOwnId)))
      .rejects.toThrow('ledger_not_found');
    const outsider = friend(fx.outsiderUserId);
    await expect(db.withActor(outsider, (tx) => contribute(tx, outsider, fx.poolId, 1000)))
      .rejects.toThrow('ledger_not_found');
    const buyer = friend();
    await expect(db.withActor(buyer, (tx) => contribute(tx, { ...buyer, circleId: fx.otherCircleId }, fx.poolId, 1000)))
      .rejects.toThrow('ledger_actor_mismatch');
    await expect(db.withActor(owner(), (tx) => claimItem(tx, owner(), fx.itemOwnId)))
      .rejects.toThrow('ledger_role_denied');
    const otherItem = await db.prisma.item.create({ data: {
      circleId: fx.otherCircleId, addedByUserId: fx.outsiderUserId, title: 'Other-circle gift', confirmed: true,
    } });
    const otherPool = await db.prisma.pool.create({ data: {
      itemId: otherItem.id, buyerUserId: fx.outsiderUserId, targetMinor: 10000, currency: 'ZAR',
    } });
    await expect(db.withActor(buyer, (tx) => contribute(tx, buyer, otherPool.id, 1000)))
      .rejects.toThrow('ledger_not_found');
    await db.prisma.membership.update({
      where: { circleId_userId: { circleId: fx.circleId, userId: fx.friendBUserId } }, data: { status: 'removed' },
    });
    try {
      const removed = friend(fx.friendBUserId);
      await expect(db.withActor(removed, (tx) => contribute(tx, removed, fx.poolId, 1000)))
        .rejects.toThrow('ledger_not_found');
    } finally {
      await db.prisma.membership.update({
        where: { circleId_userId: { circleId: fx.circleId, userId: fx.friendBUserId } }, data: { status: 'active' },
      });
    }
  });

  it('releases the canonical item advisory lock on rollback so a waiting friend can claim', async () => {
    const item = await wantedItem();
    const first = friend();
    const second = friend(fx.friendBUserId);
    const ready = deferred<void>();
    const abort = deferred<void>();
    const started = deferred<number>();
    let abortedClaimId: string | undefined;
    const holder = db.withActor(first, async (tx) => {
      const claim = await claimItem(tx, first, item.id.toUpperCase());
      abortedClaimId = claim.id;
      ready.resolve();
      await abort.promise;
      throw new Error('caller_abort');
    });
    const holderResult = holder.catch((error: Error) => error);
    await Promise.race([ready.promise, holder]);
    const waiter = db.withActor(second, async (tx) => {
      const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      started.resolve(row!.pid);
      return claimItem(tx, second, item.id);
    });
    const waiterResult = waiter.catch((error: Error) => error);
    try {
      const pid = await Promise.race([started.promise, waiter.then(() => { throw new Error('missing_waiter_pid'); })]);
      await expect.poll(async () => {
        const { rows } = await db.pool.query<{ blocked: boolean }>(
          "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid = $1 AND locktype = 'advisory' AND NOT granted) AS blocked", [pid]);
        return rows[0]!.blocked;
      }, { timeout: 3000, interval: 10 }).toBe(true);
    } finally {
      abort.resolve();
      await Promise.all([holderResult, waiterResult]);
    }
    expect(await holderResult).toMatchObject({ message: 'caller_abort' });
    const claim = await waiter;
    expect(claim).toMatchObject({ itemId: item.id, userId: second.userId, status: 'claimed' });
    expect(await db.withActor(second, (tx) => tx.claim.findMany({ where: { itemId: item.id } }))).toEqual([claim]);
    expect(await db.withActor(second, (tx) => tx.ledgerEvent.count({ where: { entityId: abortedClaimId } }))).toBe(0);
    expect(await db.withActor(second, (tx) => tx.ledgerEvent.count({
      where: { entityId: claim.id, action: 'claim.claimed' },
    }))).toBe(1);
  });

  it.each(['contribute', 'markPaid', 'purchasePool'] as const)(
    '%s waits for the item advisory lock before taking a pool row lock', async (operation) => {
      const item = await wantedItem();
      const buyer = friend();
      const pool = await db.withActor(buyer, (tx) => createPool(tx, buyer, item.id, 10000));
      if (operation !== 'contribute') await db.withActor(buyer, (tx) => contribute(tx, buyer, pool.id, 10000));
      if (operation === 'purchasePool') await db.withActor(buyer, (tx) => markPaid(tx, buyer, pool.id));
      const ready = deferred<void>();
      const unlock = deferred<void>();
      const started = deferred<number>();
      const holder = db.withActor(buyer, async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended('ledger:item:' || ${item.id}::uuid::text, 0))`;
        ready.resolve();
        await unlock.promise;
      });
      const holderResult = holder.catch((error: Error) => error);
      await Promise.race([ready.promise, holder]);
      const waiter = db.withActor(buyer, async (tx) => {
        const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        started.resolve(row!.pid);
        if (operation === 'contribute') return contribute(tx, buyer, pool.id, 10000);
        if (operation === 'markPaid') return markPaid(tx, buyer, pool.id);
        return purchasePool(tx, buyer, pool.id);
      });
      const waiterResult = waiter.catch((error: Error) => error);
      try {
        const pid = await Promise.race([started.promise, waiter.then(() => { throw new Error('missing_waiter_pid'); })]);
        await expect.poll(async () => {
          const { rows } = await db.pool.query<{ blocked: boolean }>(
            "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid = $1 AND locktype = 'advisory' AND NOT granted) AS blocked", [pid]);
          return rows[0]!.blocked;
        }, { timeout: 3000, interval: 10 }).toBe(true);
        const { rows } = await db.pool.query<{ rowLocked: boolean }>(
          "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid = $1 AND relation = 'pools'::regclass AND mode = 'RowShareLock') AS \"rowLocked\"", [pid]);
        expect(rows[0]!.rowLocked).toBe(false);
      } finally {
        unlock.resolve();
        await Promise.all([holderResult, waiterResult]);
      }
      await holder;
      const result = await waiter;
      if (operation === 'contribute') expect(result).toMatchObject({ status: 'promised' });
      if (operation === 'markPaid') expect(result).toMatchObject({ pool: { status: 'funded' }, contribution: { status: 'marked_paid' } });
      if (operation === 'purchasePool') expect(result).toMatchObject({ status: 'purchased' });
    });

  it('rolls back a contribution, new pool-member claim, and append-only events together', async () => {
    const item = await wantedItem();
    const buyer = friend();
    const contributor = friend(fx.friendBUserId);
    const pool = await db.withActor(buyer, (tx) => createPool(tx, buyer, item.id, 10000));
    const before = await db.withActor(buyer, (tx) => tx.ledgerEvent.count({ where: { circleId: fx.circleId } }));
    await expect(db.withActor(contributor, async (tx) => {
      await contribute(tx, contributor, pool.id, 5000);
      throw new Error('caller_abort');
    })).rejects.toThrow('caller_abort');
    expect(await db.withActor(buyer, (tx) => tx.contribution.count({ where: { poolId: pool.id } }))).toBe(0);
    expect(await db.withActor(buyer, (tx) => tx.claim.count({ where: { poolId: pool.id, userId: contributor.userId } }))).toBe(0);
    expect(await db.withActor(buyer, (tx) => tx.ledgerEvent.count({ where: { circleId: fx.circleId } }))).toBe(before);
    expect(await db.withActor(contributor, (tx) => contribute(tx, contributor, pool.id, 5000)))
      .toMatchObject({ status: 'promised', amountMinor: 5000 });
  });

  it('rolls back pool creation and funding with their claims and events', async () => {
    const item = await wantedItem();
    const buyer = friend();
    const before = await db.withActor(buyer, (tx) => tx.ledgerEvent.count());
    await expect(db.withActor(buyer, async (tx) => {
      await createPool(tx, buyer, item.id, 10000);
      throw new Error('caller_abort');
    })).rejects.toThrow('caller_abort');
    expect(await db.withActor(buyer, (tx) => tx.pool.count({ where: { itemId: item.id } }))).toBe(0);
    expect(await db.withActor(buyer, (tx) => tx.claim.count({ where: { itemId: item.id } }))).toBe(0);
    expect(await db.withActor(buyer, (tx) => tx.ledgerEvent.count())).toBe(before);
    const pool = await db.withActor(buyer, (tx) => createPool(tx, buyer, item.id, 10000));
    const contribution = await db.withActor(buyer, (tx) => contribute(tx, buyer, pool.id, 10000));
    const fundingBefore = await db.withActor(buyer, (tx) => tx.ledgerEvent.count());
    await expect(db.withActor(buyer, async (tx) => {
      await markPaid(tx, buyer, pool.id);
      throw new Error('caller_abort');
    })).rejects.toThrow('caller_abort');
    expect(await db.withActor(buyer, (tx) => tx.pool.findUnique({ where: { id: pool.id } })))
      .toMatchObject({ status: 'open' });
    expect(await db.withActor(buyer, (tx) => tx.contribution.findUnique({ where: { id: contribution.id } })))
      .toMatchObject({ status: 'promised', paidAt: null });
    expect(await db.withActor(buyer, (tx) => tx.ledgerEvent.count())).toBe(fundingBefore);
    expect(await db.withActor(buyer, (tx) => markPaid(tx, buyer, pool.id)))
      .toMatchObject({ pool: { status: 'funded' }, contribution: { status: 'marked_paid' } });
  });

  it('does not mark or settle a legacy mixed-currency contribution as ZAR money', async () => {
    const item = await wantedItem();
    const buyer = friend();
    const pool = await db.withActor(buyer, (tx) => createPool(tx, buyer, item.id, 10000));
    await db.prisma.contribution.create({ data: {
      poolId: pool.id, userId: buyer.userId, amountMinor: 10000, currency: 'USD', status: 'promised',
    } });
    await expect(db.withActor(buyer, (tx) => markPaid(tx, buyer, pool.id)))
      .rejects.toThrow('ledger_currency_unsupported');
    await expect(db.withActor(buyer, (tx) => contribute(tx, buyer, pool.id, 10000)))
      .rejects.toThrow('ledger_currency_unsupported');
    await db.prisma.pool.update({ where: { id: pool.id }, data: { status: 'funded' } });
    await expect(db.withActor(buyer, (tx) => purchasePool(tx, buyer, pool.id)))
      .rejects.toThrow('ledger_currency_unsupported');
    expect(await db.withActor(buyer, (tx) => tx.contribution.findMany({ where: { poolId: pool.id } })))
      .toMatchObject([{ status: 'promised', currency: 'USD' }]);
    await db.prisma.pool.update({ where: { id: pool.id }, data: { currency: 'USD' } });
    await expect(db.withActor(buyer, (tx) => createPool(tx, buyer, item.id, 10000)))
      .rejects.toThrow('ledger_currency_unsupported');
  });

  it('does not overwrite a fulfilled claim when creating a pool contribution', async () => {
    const item = await wantedItem();
    const buyer = friend();
    const pool = await db.withActor(buyer, (tx) => createPool(tx, buyer, item.id, 10000));
    await db.prisma.claim.update({
      where: { itemId_userId: { itemId: item.id, userId: buyer.userId } }, data: { status: 'fulfilled' },
    });
    await expect(db.withActor(buyer, (tx) => contribute(tx, buyer, pool.id, 10000)))
      .rejects.toThrow('ledger_claim_unavailable');
    expect(await db.withActor(buyer, (tx) => tx.contribution.count({ where: { poolId: pool.id } }))).toBe(0);
    expect(await db.withActor(buyer, (tx) => tx.claim.findUnique({
      where: { itemId_userId: { itemId: item.id, userId: buyer.userId } },
    }))).toMatchObject({ status: 'fulfilled' });
  });

  it('pins actual table grants independently of row-level policy permissions', async () => {
    for (const actor of [owner(), friend()]) {
      const grants = await db.withActor(actor, (tx) => tx.$queryRaw<{ table: string; read: boolean; insert: boolean; update: boolean }[]>`
        SELECT name AS "table", has_table_privilege(current_user, name, 'SELECT') AS read,
          has_table_privilege(current_user, name, 'INSERT') AS insert,
          has_table_privilege(current_user, name, 'UPDATE') AS update
        FROM unnest(ARRAY['circles', 'memberships', 'items', 'claims', 'pools', 'contributions', 'ledger_events']) AS name`);
      expect(grants).toHaveLength(7);
      expect(grants.every((grant) => grant.read && grant.insert && grant.update)).toBe(true);
    }
  });

  it('requires a meaningful human title and a parsed draft, while allowing manual entry without a price', async () => {
    const actor = owner();
    await expect(db.withActor(actor, (tx) => addItem(tx, actor, { title: ' \t ' })))
      .rejects.toThrow('ledger_invalid_item');
    const received = await db.prisma.ingestEvent.create({ data: {
      circleId: fx.circleId, userId: actor.userId, waMessageId: `ledger-${crypto.randomUUID()}`,
      kind: 'text', status: 'received',
    } });
    await expect(db.withActor(actor, (tx) => addItem(tx, actor, { title: 'Gift cup', ingestEventId: received.id })))
      .rejects.toThrow('ledger_draft_unavailable');
    const item = await db.withActor(actor, (tx) => addItem(tx, actor, { title: '  Gift cup  ' }));
    expect(item).toMatchObject({ title: 'Gift cup', priceMinor: null, currency: 'ZAR', confirmed: true, visibility: 'owner_visible' });
    await expect(db.withActor(friend(), (tx) => claimItem(tx, friend(), fx.itemSecretId)))
      .rejects.toThrow('ledger_item_unavailable');
  });
});
