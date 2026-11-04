import type { Actor, Tx } from '@/server/db/client';
import type { CircleItemLink, RegistryItem } from '@/generated/prisma/client';
import { DEFAULT_CURRENCY, isCurrency } from '@/lib/money';

/**
 * Canonical registry writes (docs/plans/shared-registry-and-circles.md Q1).
 * Only the receiver manages their own canonical rows, and only under the owner
 * role — friends get no registry view at all (Q3), so a friend actor here is the
 * same uniform `ledger_not_found` as "not yours". Linking additionally requires
 * the actor to be scoped to the target circle and to own it, which keeps proxy
 * circles (Q5: no owner) off the canonical registry without a special case.
 */

async function ownerSession(tx: Tx, actor: Actor) {
  if (actor.role !== 'owner') throw new Error('ledger_not_found');
  const [session] = await tx.$queryRaw<{ role: string; userId: string | null }[]>`
    SELECT current_user::text AS role, app_user_id()::text AS "userId"`;
  if (session?.role !== 'app_owned' || session.userId !== actor.userId) {
    throw new Error('ledger_actor_mismatch');
  }
}

function money(amount: number, minimum = 1) {
  if (!Number.isSafeInteger(amount) || amount < minimum || amount > 2147483647) throw new Error('ledger_invalid_money');
}

async function ownedCircle(tx: Tx, actor: Actor, circleId: string) {
  if (actor.circleId !== circleId) throw new Error('ledger_not_found');
  const circle = await tx.circle.findFirst({
    where: { id: circleId, status: 'active', ownerUserId: actor.userId },
    select: { id: true },
  });
  if (!circle) throw new Error('ledger_not_found');
  return circle;
}

async function ownedItem(tx: Tx, actor: Actor, registryItemId: string) {
  const item = await tx.registryItem.findFirst({
    where: { id: registryItemId, ownerUserId: actor.userId },
  });
  if (!item) throw new Error('ledger_not_found');
  return item;
}

export interface RegistryItemInput {
  title: string;
  retailer?: string;
  priceMinor?: number;
  currency?: string;
  canonicalUrl?: string;
  imagePath?: string;
}

/** The receiver creates one canonical wish. It is visible nowhere until linked and shown. */
export async function createRegistryItem(tx: Tx, actor: Actor, input: RegistryItemInput): Promise<RegistryItem> {
  await ownerSession(tx, actor);
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > 200) throw new Error('ledger_invalid_item');
  if (input.currency !== undefined && !isCurrency(input.currency)) throw new Error('ledger_currency_unsupported');
  if (input.priceMinor !== undefined) money(input.priceMinor, 0);
  return tx.registryItem.create({ data: {
    ownerUserId: actor.userId,
    title,
    retailer: input.retailer?.trim() || undefined,
    priceMinor: input.priceMinor,
    currency: input.currency ?? DEFAULT_CURRENCY,
    canonicalUrl: input.canonicalUrl?.trim() || undefined,
    imagePath: input.imagePath,
  } });
}

/**
 * Idempotent on (item, circle): a repeated link is an upsert that keeps the
 * current visibility, never a second row. New links are hidden (Q4).
 */
export async function linkRegistryItem(
  tx: Tx, actor: Actor, registryItemId: string, circleId: string,
): Promise<CircleItemLink> {
  await ownerSession(tx, actor);
  await ownedCircle(tx, actor, circleId);
  await ownedItem(tx, actor, registryItemId);
  return tx.circleItemLink.upsert({
    where: { registryItemId_circleId: { registryItemId, circleId } },
    update: {},
    create: { registryItemId, circleId, addedByUserId: actor.userId },
  });
}

/** Removing a link hides the wish from that circle; the canonical item survives. */
export async function unlinkRegistryItem(
  tx: Tx, actor: Actor, registryItemId: string, circleId: string,
): Promise<void> {
  await ownerSession(tx, actor);
  await ownedCircle(tx, actor, circleId);
  await ownedItem(tx, actor, registryItemId);
  await tx.circleItemLink.deleteMany({ where: { registryItemId, circleId } });
}

/**
 * The mandatory per-circle preview (the mis-set-flag backstop): stamping proves
 * the receiver saw this circle's list before anything may be shown. Only
 * hidden, non-private links are stamped — showing is the only thing a preview
 * can unlock.
 */
export async function previewCircleLinks(tx: Tx, actor: Actor, circleId: string): Promise<number> {
  await ownerSession(tx, actor);
  await ownedCircle(tx, actor, circleId);
  const stamped = await tx.circleItemLink.updateMany({
    where: {
      circleId,
      visible: false,
      previewedAt: null,
      registryItem: { ownerUserId: actor.userId, private: false },
    },
    data: { previewedAt: new Date() },
  });
  return stamped.count;
}

/**
 * Showing requires a preview stamp (fail closed); hiding always works and clears
 * any stamp, so the exposed direction is never the easy one.
 */
export async function setLinkVisibility(
  tx: Tx, actor: Actor, registryItemId: string, circleId: string, visible: boolean,
): Promise<CircleItemLink> {
  await ownerSession(tx, actor);
  await ownedCircle(tx, actor, circleId);
  await ownedItem(tx, actor, registryItemId);
  const link = await tx.circleItemLink.findFirst({ where: { registryItemId, circleId } });
  if (!link) throw new Error('ledger_not_found');
  if (visible && link.previewedAt === null) throw new Error('ledger_preview_required');
  return tx.circleItemLink.update({
    where: { id: link.id },
    data: { visible, previewedAt: null },
  });
}

/**
 * Replace a canonical wish's product photo. The photo is re-encoded (no EXIF or
 * location) before this runs; the ledger only records the stored path.
 */
export async function setRegistryItemPhoto(
  tx: Tx, actor: Actor, registryItemId: string, imagePath: string,
): Promise<RegistryItem> {
  await ownerSession(tx, actor);
  if (!imagePath) throw new Error('ledger_invalid_item');
  const item = await ownedItem(tx, actor, registryItemId);
  return tx.registryItem.update({ where: { id: item.id }, data: { imagePath } });
}

/** The sharewear-style kill-switch: private hides the item in every circle at once. */
export async function setRegistryItemPrivate(
  tx: Tx, actor: Actor, registryItemId: string, isPrivate: boolean,
): Promise<RegistryItem> {
  await ownerSession(tx, actor);
  const item = await ownedItem(tx, actor, registryItemId);
  return tx.registryItem.update({ where: { id: item.id }, data: { private: isPrivate } });
}
