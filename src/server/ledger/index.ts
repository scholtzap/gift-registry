import { randomUUID } from 'node:crypto';
import type { Actor, Tx } from '@/server/db/client';
import type { Circle, Claim, Contribution, Item, Pool, PoolPayout, Prisma, TombstoneReason } from '@/generated/prisma/client';
import { DEFAULT_CURRENCY, isCurrency } from '@/lib/money';
import { daysUntil, isCalendarDate, zoneDay } from '@/lib/dates';

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
  if (!isCurrency(item.currency)) throw new Error('ledger_currency_unsupported');
  if (item.status !== 'active' || !item.confirmed) throw new Error('ledger_item_unavailable');
  const existing = await tx.pool.findFirst({ where: { itemId } });
  if (existing && existing.currency !== item.currency) throw new Error('ledger_currency_unsupported');
  if (existing?.buyerUserId === actor.userId && existing.targetMinor === targetMinor &&
      (existing.status === 'open' || existing.status === 'funded')) return existing;
  if (existing || await tx.claim.count({ where: { itemId, status: { in: ['claimed', 'fulfilled'] } } })) {
    throw new Error('ledger_item_reserved');
  }
  // A pool is always in its item's currency.
  const pool = await tx.pool.create({ data: { itemId, buyerUserId: actor.userId, targetMinor, currency: item.currency } });
  await joinPool(tx, actor, pool);
  await append(tx, actor, 'pool', pool.id, 'pool.opened', { targetMinor, currency: pool.currency });
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
  if (!isCurrency(pool.currency) || pool.currency !== item.currency) throw new Error('ledger_currency_unsupported');
  if (item.status !== 'active' || !item.confirmed) throw new Error('ledger_item_unavailable');
  return pool;
}

async function poolMoney(tx: Tx, pool: Pool) {
  const rows = await tx.contribution.findMany({ where: { poolId: pool.id } });
  for (const row of rows) {
    if (row.currency !== pool.currency) throw new Error('ledger_currency_unsupported');
    money(row.amountMinor);
  }
  const paid = rows.filter((row) => row.status === 'marked_paid');
  return { rows, paid, paidMinor: paid.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n) };
}

export async function contribute(tx: Tx, actor: Actor, poolId: string, amountMinor: number): Promise<Contribution> {
  await scope(tx, actor, 'friend');
  money(amountMinor);
  const pool = await lockPool(tx, actor, poolId);
  const { rows } = await poolMoney(tx, pool);
  const existing = rows.find((row) => row.userId === actor.userId);
  if (existing) {
    if (existing.amountMinor !== amountMinor) throw new Error('ledger_contribution_conflict');
    return existing;
  }
  if (pool.status !== 'open') throw new Error('ledger_pool_unavailable');
  await joinPool(tx, actor, pool);
  const contribution = await tx.contribution.create({ data: { poolId, userId: actor.userId, amountMinor, currency: pool.currency } });
  await append(tx, actor, 'contribution', contribution.id, 'contribution.promised', { poolId, amountMinor, currency: pool.currency });
  return contribution;
}

export async function markPaid(tx: Tx, actor: Actor, poolId: string): Promise<{ contribution: Contribution; pool: Pool }> {
  await scope(tx, actor, 'friend');
  let pool = await lockPool(tx, actor, poolId);
  if (pool.status !== 'open' && pool.status !== 'funded') throw new Error('ledger_pool_unavailable');
  const { rows, paidMinor } = await poolMoney(tx, pool);
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

/**
 * The pool buyer records where pledgers should send their share by hand — account
 * holder, bank, account and branch code, with an explicit share switch. Bank
 * details are ordinary payee details (the kind printed on an invoice), stored so
 * the group can settle manually; Piñata never moves money and never sees it move.
 * Only the buyer writes; the route re-checks the shape and answers 422, this
 * throws `ledger_buyer_required` or `ledger_pool_unavailable` for anything else.
 */
export interface PayoutDetailsInput {
  accountHolder: string;
  bankName: string;
  accountNumber: string;
  branchCode: string;
  accountType?: string | null;
  referencePrefix?: string | null;
  shareConsent: boolean;
}

export const PAYOUT_ACCOUNT_TYPES = ['cheque', 'savings', 'transmission'] as const;

function cleanPayout(input: PayoutDetailsInput) {
  const accountHolder = input.accountHolder.trim().slice(0, 80);
  const bankName = input.bankName.trim().slice(0, 80);
  const accountNumber = input.accountNumber.replace(/[\s-]/g, '');
  const branchCode = input.branchCode.replace(/[\s-]/g, '');
  const accountType = (input.accountType ?? '').trim().toLowerCase() || null;
  const referencePrefix = (input.referencePrefix ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || null;
  if (!accountHolder || !bankName) throw new Error('ledger_invalid_payout');
  if (!/^\d{6,20}$/.test(accountNumber) || !/^\d{6}$/.test(branchCode)) throw new Error('ledger_invalid_payout');
  if (accountType !== null && !(PAYOUT_ACCOUNT_TYPES as readonly string[]).includes(accountType)) {
    throw new Error('ledger_invalid_payout');
  }
  return { accountHolder, bankName, accountNumber, branchCode, accountType, referencePrefix, shareConsent: input.shareConsent };
}

export async function savePayout(tx: Tx, actor: Actor, poolId: string, input: PayoutDetailsInput): Promise<PoolPayout> {
  await scope(tx, actor, 'friend');
  const pool = await lockPool(tx, actor, poolId);
  if (pool.buyerUserId !== actor.userId) throw new Error('ledger_buyer_required');
  if (pool.status !== 'open' && pool.status !== 'funded') throw new Error('ledger_pool_unavailable');
  const details = cleanPayout(input);
  const row = await tx.poolPayout.upsert({
    where: { poolId },
    create: { poolId, buyerUserId: actor.userId, ...details },
    update: { ...details },
  });
  await append(tx, actor, 'payout', row.id, 'payout.saved', { poolId });
  return row;
}

/**
 * The buyer confirms a pledger's share landed. Same status machine as a
 * self-mark; the buyer simply names whose contribution it settles.
 */
export async function markPaidFor(tx: Tx, actor: Actor, poolId: string, targetUserId: string): Promise<{ contribution: Contribution; pool: Pool }> {
  await scope(tx, actor, 'friend');
  let pool = await lockPool(tx, actor, poolId);
  if (pool.buyerUserId !== actor.userId) throw new Error('ledger_buyer_required');
  if (pool.status !== 'open' && pool.status !== 'funded') throw new Error('ledger_pool_unavailable');
  const { rows, paidMinor } = await poolMoney(tx, pool);
  let contribution = rows.find((row) => row.userId === targetUserId);
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

/**
 * Stable, typable payment reference for a contribution: the buyer's optional
 * prefix, else `PN-`, plus six hex chars of the contribution id. Deterministic,
 * so the share text never needs a stored column to stay constant.
 */
export function payoutReference(contributionId: string, prefix?: string | null): string {
  const code = contributionId.replace(/-/g, '').slice(0, 6).toUpperCase();
  const clean = (prefix ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return `${clean || 'PN'}-${code}`;
}

export async function purchasePool(tx: Tx, actor: Actor, poolId: string): Promise<Pool> {
  await scope(tx, actor, 'friend');
  const pool = await lockPool(tx, actor, poolId);
  if (pool.buyerUserId !== actor.userId) throw new Error('ledger_buyer_required');
  if (pool.status === 'purchased') return pool;
  if (pool.status !== 'funded') throw new Error('ledger_pool_unavailable');
  const { paid, paidMinor } = await poolMoney(tx, pool);
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
  /** A path from `storePhoto`, already re-encoded. */
  imagePath?: string;
}

/** This call is the human confirmation, not a model/worker auto-commit. */
export async function addItem(tx: Tx, actor: Actor, input: AddItemInput): Promise<Item> {
  await scope(tx, actor);
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) throw new Error('ledger_invalid_item');
  if (input.currency !== undefined && !isCurrency(input.currency)) throw new Error('ledger_currency_unsupported');
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
  const circleRow = input.currency === undefined
    ? await tx.circle.findFirst({ where: { id: actor.circleId! }, select: { defaultCurrency: true } })
    : null;
  const item = await tx.item.create({ data: {
    circleId: actor.circleId!, addedByUserId: actor.userId, title,
    retailer: input.retailer, priceMinor: input.priceMinor,
    currency: input.currency ?? (circleRow && isCurrency(circleRow.defaultCurrency) ? circleRow.defaultCurrency : DEFAULT_CURRENCY),
    imagePath: input.imagePath, visibility, confirmed: true,
  } });
  if (ingestId) {
    await tx.ingestEvent.update({ where: { id: ingestId, status: 'parsed', itemId: null }, data: { status: 'confirmed', itemId: item.id } });
  }
  await append(tx, actor, 'item', item.id, 'item.added');
  return item;
}

/**
 * Add or replace an item's product photo. Owner: their own wishes only. Friend: only ideas
 * they added themselves. Anything else is ledger_not_found, so the route 404s.
 */
export async function setItemPhoto(tx: Tx, actor: Actor, itemId: string, imagePath: string): Promise<Item> {
  await scope(tx, actor);
  if (!imagePath) throw new Error('ledger_invalid_item');
  const item = await lockItem(tx, actor, itemId);
  const mine = actor.role === 'owner'
    ? item.visibility === 'owner_visible'
    : item.addedByUserId === actor.userId;
  if (!mine || item.status === 'tombstoned') throw new Error('ledger_not_found');
  const updated = await tx.item.update({ where: { id: item.id }, data: { imagePath } });
  await append(tx, actor, 'item', item.id, 'item.photo_set');
  return updated;
}

export interface CreateCircleInput {
  name: string;
  occasion: string;
  eventDate: Date | string;
  shareSlug?: string;
  phoneHashes?: string[];
  defaultCurrency?: string;
}

export async function createCircle(tx: Tx, actor: Actor, input: CreateCircleInput): Promise<Circle> {
  await session(tx, actor, 'owner');
  if (input.defaultCurrency !== undefined && !isCurrency(input.defaultCurrency)) throw new Error('ledger_currency_unsupported');
  if (!input.name.trim() || !input.occasion.trim() || !Number.isFinite(new Date(input.eventDate).getTime()) ||
      input.phoneHashes?.some((hash) => !/^[a-f0-9]{64}$/.test(hash))) {
    throw new Error('ledger_invalid_circle');
  }
  const shareSlug = input.shareSlug ?? `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'circle'}-${randomUUID().slice(0, 8)}`;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(shareSlug) || shareSlug.length > 64) throw new Error('ledger_invalid_circle');
  // The three writes are one fact: a circle without its owner membership is ownerless, and
  // `memberships_owner_join` is the policy that admits the second write. Allowlist hashes
  // arrive hashed — the ledger never sees a number.
  //
  // createMany, not create: Prisma's create is INSERT ... RETURNING, and the RETURNING
  // visibility check runs on the statement-start snapshot, where `app_actor_owns_circle`
  // cannot yet see the row being inserted (the same trap `memberships_self_join` documents).
  // The read-back is a new statement, so the policy sees the circle and admits its owner.
  await tx.circle.createMany({
    data: {
      name: input.name.trim(), occasion: input.occasion.trim(),
      ...(input.defaultCurrency !== undefined ? { defaultCurrency: input.defaultCurrency } : {}),
      eventDate: new Date(input.eventDate), eventDateSetByUserId: actor.userId,
      ownerUserId: actor.userId, shareSlug,
    },
  });
  const circle = await tx.circle.findFirstOrThrow({ where: { shareSlug } });
  await tx.membership.create({ data: { circleId: circle.id, userId: actor.userId, role: 'owner', status: 'active' } });
  if (input.phoneHashes?.length) {
    await tx.allowlistEntry.createMany({
      data: input.phoneHashes.map((phoneE164Hash) => ({ circleId: circle.id, phoneE164Hash, addedBy: actor.userId })),
      skipDuplicates: true,
    });
  }
  await tx.ledgerEvent.create({
    data: { circleId: circle.id, actorUserId: actor.userId, entity: 'circle', entityId: circle.id, action: 'circle.created' },
  });
  return circle;
}

export async function tombstoneItem(tx: Tx, actor: Actor, itemId: string, reason: TombstoneReason): Promise<Item> {
  await scope(tx, actor, 'owner');
  if (!['bought_self', 'no_longer_wants', 'duplicate'].includes(reason)) throw new Error('ledger_invalid_reason');
  const item = await lockItem(tx, actor, itemId);
  if (item.addedByUserId !== actor.userId || item.visibility !== 'owner_visible' || item.status !== 'active') throw new Error('ledger_not_found');
  // The write itself is `app_tombstone_item`: app_owned has no pool policy at all (that is
  // the owner's blindness working), so a Prisma update here could neither see a surviving
  // pool nor pivot it. The function returns only the pool's status word — never a count,
  // a contributor, or an amount — and the owner learns nothing the tombstone does not
  // already tell them: their own deleted item had a pool, and friends now need a new plan.
  const [result] = await tx.$queryRaw<{ state: string | null }[]>`SELECT app_tombstone_item(${itemId}::uuid, ${reason}) AS state`;
  if (!result?.state) throw new Error('ledger_not_found');
  await append(tx, actor, 'item', item.id, 'item.tombstoned', { reason, pool: result.state });
  return { ...item, status: 'tombstoned', tombstoneReason: reason, tombstonedAt: new Date() };
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

/**
 * F14: hand a secret suggestion to the owner after the day. Friend-only, date-gated,
 * author-vetoed, and one guarded UPDATE — zero rows is the same `ledger_not_found` as
 * "not yours", so the response cannot probe which half refused. No notification is sent;
 * the reveal stays a human act the owner discovers in their own ledger.
 */
export async function revealItem(tx: Tx, actor: Actor, itemId: string, today: string = zoneDay()): Promise<Item> {
  const circle = await scope(tx, actor, 'friend');
  const item = await lockItem(tx, actor, itemId);
  if (item.status !== 'active' || item.visibility !== 'friend_only' || !item.revealOk || !circle.eventDate) {
    throw new Error('ledger_not_found');
  }
  if (daysUntil(circle.eventDate.toISOString().slice(0, 10), today) >= 0) throw new Error('ledger_not_found');
  const { count } = await tx.item.updateMany({
    where: { id: item.id, status: 'active', visibility: 'friend_only', revealOk: true },
    data: { status: 'revealed', revealedAt: new Date(), revealedByUserId: actor.userId },
  });
  if (count !== 1) throw new Error('ledger_not_found');
  await append(tx, actor, 'item', item.id, 'item.revealed');
  return tx.item.findFirstOrThrow({ where: { id: item.id } });
}
