import type { Actor, Tx } from '@/server/db/client';
import type { Circle, Claim, Contribution, Item, Pool, Prisma, TombstoneReason } from '@/generated/prisma/client';
import { isCalendarDate } from '@/lib/dates';

async function session(tx: Tx, actor: Actor, role?: Actor['role']) {
  if (role !== undefined && actor.role !== role) throw new Error('ledger_role_denied');
  const [session] = await tx.$queryRaw<{ role: string; userId: string | null; circleId: string | null }[]>`
    SELECT current_user::text AS role, app_user_id()::text AS "userId", app_circle_id()::text AS "circleId"`;
  if (session?.role !== (actor.role === 'owner' ? 'app_owned' : 'app_friend') ||
      session.userId !== actor.userId || session.circleId !== actor.circleId) {
    throw new Error('ledger_actor_mismatch');
  }
}

async function scope(tx: Tx, actor: Actor, role?: Actor['role']) {
  await session(tx, actor, role);
  if (actor.circleId === null) throw new Error('ledger_circle_required');
  const circle = await tx.circle.findFirst({ where: { id: actor.circleId, status: 'active' } });
  const member = await tx.membership.findFirst({ where: {
    circleId: actor.circleId, userId: actor.userId, role: actor.role, status: 'active',
  } });
  if (!circle || !member || (actor.role === 'owner') !== (circle.ownerUserId === actor.userId)) {
    throw new Error('ledger_not_found');
  }
  return circle;
}

async function lockItem(tx: Tx, actor: Actor, itemId: string) {
  // Canonical UUID text gives every actor and item/pool transition the same transaction lock.
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended('ledger:item:' || ${itemId}::uuid::text, 0))`;
  const item = await tx.item.findFirst({ where: { id: itemId, circleId: actor.circleId! } });
  if (!item) throw new Error('ledger_not_found');
  return item;
}

async function append(tx: Tx, actor: Actor, entity: string, entityId: string, action: string,
  payload?: Prisma.InputJsonObject) {
  await tx.ledgerEvent.create({ data: {
    circleId: actor.circleId!, actorUserId: actor.userId, entity, entityId, action, payload,
  } });
}

export async function claimItem(tx: Tx, actor: Actor, itemId: string): Promise<Claim> {
  await scope(tx, actor, 'friend');
  const item = await lockItem(tx, actor, itemId);
  if (item.status !== 'active' || !item.confirmed) throw new Error('ledger_item_unavailable');
  const existing = await tx.claim.findUnique({ where: { itemId_userId: { itemId, userId: actor.userId } } });
  if (existing?.status === 'claimed' && existing.kind === 'solo') return existing;
  if (await tx.pool.count({ where: { itemId } }) ||
      await tx.claim.count({ where: { itemId, status: { in: ['claimed', 'fulfilled'] } } })) {
    throw new Error('ledger_item_reserved');
  }
  const claim = existing
    ? await tx.claim.update({ where: { id: existing.id, status: 'released' }, data: { status: 'claimed', kind: 'solo', poolId: null } })
    : await tx.claim.create({ data: { itemId, userId: actor.userId, kind: 'solo' } });
  await append(tx, actor, 'claim', claim.id, 'claim.claimed');
  return claim;
}

export async function releaseClaim(tx: Tx, actor: Actor, itemId: string): Promise<Claim> {
  await scope(tx, actor, 'friend');
  await lockItem(tx, actor, itemId);
  const claim = await tx.claim.findUnique({ where: { itemId_userId: { itemId, userId: actor.userId } } });
  if (!claim) throw new Error('ledger_not_found');
  if (claim.status === 'released') return claim;
  if (claim.status !== 'claimed' || claim.kind !== 'solo') throw new Error('ledger_claim_unavailable');
  const released = await tx.claim.update({ where: { id: claim.id, status: 'claimed' }, data: { status: 'released' } });
  await append(tx, actor, 'claim', claim.id, 'claim.released');
  return released;
}

function money(amount: number, minimum = 1) {
  if (!Number.isSafeInteger(amount) || amount < minimum || amount > 2147483647) throw new Error('ledger_invalid_money');
}

export async function createPool(tx: Tx, actor: Actor, itemId: string, targetMinor: number): Promise<Pool> {
  await scope(tx, actor, 'friend');
  money(targetMinor);
  const item = await lockItem(tx, actor, itemId);
  if (item.currency !== 'ZAR') throw new Error('ledger_currency_unsupported');
  if (item.status !== 'active' || !item.confirmed) throw new Error('ledger_item_unavailable');
  const existing = await tx.pool.findFirst({ where: { itemId } });
  if (existing && existing.currency !== 'ZAR') throw new Error('ledger_currency_unsupported');
  if (existing?.buyerUserId === actor.userId && existing.targetMinor === targetMinor &&
      (existing.status === 'open' || existing.status === 'funded')) return existing;
  if (existing || await tx.claim.count({ where: { itemId, status: { in: ['claimed', 'fulfilled'] } } })) {
    throw new Error('ledger_item_reserved');
  }
  const pool = await tx.pool.create({ data: { itemId, buyerUserId: actor.userId, targetMinor, currency: 'ZAR' } });
  await joinPool(tx, actor, pool);
  await append(tx, actor, 'pool', pool.id, 'pool.opened', { targetMinor, currency: 'ZAR' });
  return pool;
}

async function joinPool(tx: Tx, actor: Actor, pool: Pool) {
  const existing = await tx.claim.findUnique({
    where: { itemId_userId: { itemId: pool.itemId, userId: actor.userId } },
  });
  if (existing?.status === 'claimed' && existing.kind === 'pool_member' && existing.poolId === pool.id) return existing;
  if (existing && existing.status !== 'released') throw new Error('ledger_claim_unavailable');
  const claim = existing
    ? await tx.claim.update({ where: { id: existing.id, status: 'released' },
      data: { status: 'claimed', kind: 'pool_member', poolId: pool.id } })
    : await tx.claim.create({ data: { itemId: pool.itemId, userId: actor.userId, kind: 'pool_member', poolId: pool.id } });
  await append(tx, actor, 'claim', claim.id, 'claim.claimed', { poolId: pool.id });
  return claim;
}

async function lockPool(tx: Tx, actor: Actor, poolId: string) {
  const visiblePool = await tx.pool.findUnique({ where: { id: poolId } });
  if (!visiblePool) throw new Error('ledger_not_found');
  // Always lock the item before a pool row, matching claim/release/createPool.
  const item = await lockItem(tx, actor, visiblePool.itemId);
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM pools p JOIN items i ON i.id = p.item_id
    WHERE p.id = ${poolId}::uuid AND p.item_id = ${item.id}::uuid
      AND i.circle_id = ${actor.circleId}::uuid FOR UPDATE OF p`;
  if (!rows.length) throw new Error('ledger_not_found');
  const pool = await tx.pool.findFirst({ where: { id: poolId, itemId: item.id } });
  if (!pool) throw new Error('ledger_not_found');
  if (pool.currency !== 'ZAR' || item.currency !== 'ZAR') throw new Error('ledger_currency_unsupported');
  if (item.status !== 'active' || !item.confirmed) throw new Error('ledger_item_unavailable');
  return pool;
}

async function poolMoney(tx: Tx, poolId: string) {
  const rows = await tx.contribution.findMany({ where: { poolId } });
  for (const row of rows) {
    if (row.currency !== 'ZAR') throw new Error('ledger_currency_unsupported');
    money(row.amountMinor);
  }
  const paid = rows.filter((row) => row.status === 'marked_paid');
  return { rows, paid, paidMinor: paid.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n) };
}

export async function contribute(tx: Tx, actor: Actor, poolId: string, amountMinor: number): Promise<Contribution> {
  await scope(tx, actor, 'friend');
  money(amountMinor);
  const pool = await lockPool(tx, actor, poolId);
  const { rows } = await poolMoney(tx, poolId);
  const existing = rows.find((row) => row.userId === actor.userId);
  if (existing) {
    if (existing.amountMinor !== amountMinor) throw new Error('ledger_contribution_conflict');
    return existing;
  }
  if (pool.status !== 'open') throw new Error('ledger_pool_unavailable');
  await joinPool(tx, actor, pool);
  const contribution = await tx.contribution.create({ data: { poolId, userId: actor.userId, amountMinor, currency: 'ZAR' } });
  await append(tx, actor, 'contribution', contribution.id, 'contribution.promised', { poolId, amountMinor, currency: 'ZAR' });
  return contribution;
}

export async function markPaid(tx: Tx, actor: Actor, poolId: string): Promise<{ contribution: Contribution; pool: Pool }> {
  await scope(tx, actor, 'friend');
  let pool = await lockPool(tx, actor, poolId);
  if (pool.status !== 'open' && pool.status !== 'funded') throw new Error('ledger_pool_unavailable');
  const { rows, paidMinor } = await poolMoney(tx, poolId);
  let contribution = rows.find((row) => row.userId === actor.userId);
  if (!contribution) throw new Error('ledger_not_found');
  if (contribution.status === 'marked_paid') return { contribution, pool };
  if (contribution.status !== 'promised') throw new Error('ledger_contribution_unavailable');
  contribution = await tx.contribution.update({
    where: { id: contribution.id, status: 'promised' }, data: { status: 'marked_paid', paidAt: new Date() },
  });
  await append(tx, actor, 'contribution', contribution.id, 'contribution.marked_paid', { poolId });
  if (pool.status === 'open' && paidMinor + BigInt(contribution.amountMinor) >= BigInt(pool.targetMinor)) {
    pool = await tx.pool.update({ where: { id: poolId, status: 'open' }, data: { status: 'funded' } });
    await append(tx, actor, 'pool', poolId, 'pool.funded');
  }
  return { contribution, pool };
}

export async function purchasePool(tx: Tx, actor: Actor, poolId: string): Promise<Pool> {
  await scope(tx, actor, 'friend');
  const pool = await lockPool(tx, actor, poolId);
  if (pool.buyerUserId !== actor.userId) throw new Error('ledger_buyer_required');
  if (pool.status === 'purchased') return pool;
  if (pool.status !== 'funded') throw new Error('ledger_pool_unavailable');
  const { paid, paidMinor } = await poolMoney(tx, poolId);
  if (paidMinor < BigInt(pool.targetMinor)) {
    throw new Error('ledger_pool_not_paid');
  }
  const claims = await tx.claim.findMany({ where: { poolId, status: 'claimed' } });
  const lockedClaims = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM claims WHERE pool_id = ${poolId}::uuid AND status = 'claimed' FOR UPDATE`;
  if (lockedClaims.length !== claims.length) throw new Error('ledger_policy_blocked:purchase_claims');
  const purchased = await tx.pool.update({ where: { id: poolId, status: 'funded' }, data: { status: 'purchased' } });
  for (const contribution of paid) {
    await tx.contribution.update({ where: { id: contribution.id, status: 'marked_paid' }, data: { status: 'settled' } });
    await append(tx, actor, 'contribution', contribution.id, 'contribution.settled', { poolId });
  }
  for (const claim of claims) {
    const status = claim.userId === actor.userId || paid.some((c) => c.userId === claim.userId) ? 'fulfilled' : 'released';
    await tx.claim.update({ where: { id: claim.id, status: 'claimed' }, data: { status } });
    await append(tx, actor, 'claim', claim.id, `claim.${status}`, { poolId });
  }
  await append(tx, actor, 'pool', poolId, 'pool.purchased');
  return purchased;
}

export interface AddItemInput {
  title: string;
  retailer?: string;
  priceMinor?: number;
  currency?: string;
  ingestEventId?: string;
}

/** This call is the human confirmation, not a model/worker auto-commit. */
export async function addItem(tx: Tx, actor: Actor, input: AddItemInput): Promise<Item> {
  await scope(tx, actor);
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) throw new Error('ledger_invalid_item');
  if (input.currency !== undefined && input.currency !== 'ZAR') throw new Error('ledger_currency_unsupported');
  if (input.priceMinor !== undefined) money(input.priceMinor, 0);
  const visibility = actor.role === 'friend' ? 'friend_only' : 'owner_visible';
  let ingestId: string | undefined;
  if (input.ingestEventId) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM ingest_events WHERE id = ${input.ingestEventId}::uuid
      AND circle_id = ${actor.circleId}::uuid AND user_id = ${actor.userId}::uuid FOR UPDATE`;
    if (!rows.length) throw new Error('ledger_not_found');
    const ingest = await tx.ingestEvent.findUniqueOrThrow({ where: { id: input.ingestEventId } });
    if (ingest.status === 'confirmed' && ingest.itemId) {
      return tx.item.findFirstOrThrow({ where: { id: ingest.itemId, circleId: actor.circleId! } });
    }
    if (ingest.status !== 'parsed' || ingest.itemId !== null) throw new Error('ledger_draft_unavailable');
    ingestId = ingest.id;
  }
  const item = await tx.item.create({ data: {
    circleId: actor.circleId!, addedByUserId: actor.userId, title,
    retailer: input.retailer, priceMinor: input.priceMinor, currency: input.currency ?? 'ZAR',
    visibility, confirmed: true,
  } });
  if (ingestId) {
    await tx.ingestEvent.update({ where: { id: ingestId, status: 'parsed', itemId: null }, data: { status: 'confirmed', itemId: item.id } });
  }
  await append(tx, actor, 'item', item.id, 'item.added');
  return item;
}

export interface CreateCircleInput {
  name: string;
  occasion: string;
  eventDate: Date | string;
  phoneHashes?: string[];
}

export async function createCircle(tx: Tx, actor: Actor, input: CreateCircleInput): Promise<Circle> {
  await session(tx, actor, 'owner');
  if (!input.name.trim() || !input.occasion.trim() || !Number.isFinite(new Date(input.eventDate).getTime()) ||
      input.phoneHashes?.some((hash) => !/^[a-f0-9]{64}$/.test(hash))) {
    throw new Error('ledger_invalid_circle');
  }
  // No app_owned INSERT policy exists on memberships. Never create an ownerless circle.
  throw new Error('ledger_policy_blocked:circle_membership');
}

export async function tombstoneItem(tx: Tx, actor: Actor, itemId: string, reason: TombstoneReason): Promise<Item> {
  await scope(tx, actor, 'owner');
  if (!['bought_self', 'no_longer_wants', 'duplicate'].includes(reason)) throw new Error('ledger_invalid_reason');
  const item = await lockItem(tx, actor, itemId);
  if (item.addedByUserId !== actor.userId || item.visibility !== 'owner_visible') throw new Error('ledger_not_found');
  // app_owned cannot see or update pools, so it cannot determine or preserve their state.
  throw new Error('ledger_policy_blocked:tombstone_pool_pivot');
}

/**
 * Set the day the gift is handed over, and record that *this* actor wrote it — the pair of
 * columns the secrecy rule reads. Both roles write through `app_set_event_date` rather than a
 * Prisma update, because the writer has to come from the session: a route bug that passed a
 * user id as a field would otherwise hand anyone the owner's view of the date.
 *
 * Last writer wins, in both directions: a friend overwriting an owner-set date makes it secret,
 * an owner overwriting makes it visible again. That is the whole model, not an edge case.
 */
export async function setEventDate(tx: Tx, actor: Actor, eventDate: string): Promise<void> {
  await scope(tx, actor);
  if (!isCalendarDate(eventDate)) throw new Error('ledger_invalid_event_date');
  const [result] = await tx.$queryRaw<{ written: number }[]>`SELECT app_set_event_date(${eventDate}::date) AS written`;
  // Zero rows means the session's membership predicate did not hold. Nothing was stored, and
  // the caller answers 404 — the same indistinguishable no every other refusal here gives.
  if (result?.written !== 1) throw new Error('ledger_not_found');
}
