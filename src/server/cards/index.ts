import type { CardComposerData } from '@/components/screens/card-composer';
import type { Actor, Db, Tx } from '@/server/db/client';
import { renderCardArtwork, type CardArtworkData, type CardVariant } from './render';
import { validateCardEntry, type CardEntryInput } from './validation';

export type { CardComposerData, CardEntryInput };
export { renderCardArtwork, CardFontUnavailableError } from './render';
export type { CardArtwork, CardArtworkData, CardVariant } from './render';
export { validateCardEntry, CardEntryValidationError } from './validation';

export const DETERMINISTIC_CARD_PUN = 'A little joy, just for you.';

export class CardNotFoundError extends Error {
  constructor() {
    super('card_not_found');
    this.name = 'CardNotFoundError';
  }
}

interface CardData {
  composer: CardComposerData;
  artwork: CardArtworkData;
}

async function loadCardData(tx: Tx, actor: Actor, itemId: string): Promise<CardData | null> {
  if (actor.role !== 'friend' || !actor.circleId) return null;

  // Actual ownership, not the role supplied by a caller, is checked before any card/ledger query.
  const circle = await tx.circle.findUnique({
    where: { id: actor.circleId },
    select: { id: true, ownerUserId: true, occasion: true },
  });
  if (!circle || circle.ownerUserId === actor.userId) return null;
  const membership = await tx.membership.findUnique({
    where: { circleId_userId: { circleId: circle.id, userId: actor.userId } },
    select: { role: true, status: true },
  });
  if (!membership || membership.role !== 'friend' || membership.status !== 'active') return null;
  const item = await tx.item.findFirst({
    where: { id: itemId, circleId: circle.id },
    select: { id: true, title: true },
  });
  if (!item) return null;

  const [claims, contributions] = await Promise.all([
    tx.claim.findMany({
      where: { itemId, kind: 'solo', status: { in: ['claimed', 'fulfilled'] } },
      select: { userId: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    tx.contribution.findMany({
      where: { pool: { itemId } }, select: { userId: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
  ]);
  const giftGivers = [...new Set([...claims, ...contributions].map((row) => row.userId))]
    .filter((userId) => userId !== circle.ownerUserId);
  if (!giftGivers.includes(actor.userId)) return null;

  const [savedEntries, card, people, recipient] = await Promise.all([
    tx.cardEntry.findMany({
      where: { itemId, contributorUserId: { in: giftGivers } },
      select: { contributorUserId: true, displayNameShown: true, anonymous: true, message: true },
    }),
    tx.giftCard.findUnique({ where: { itemId }, select: { pun: true } }),
    tx.user.findMany({ where: { id: { in: giftGivers } }, select: { id: true, displayName: true } }),
    tx.user.findUnique({ where: { id: circle.ownerUserId }, select: { displayName: true } }),
  ]);
  const savedByUser = new Map(savedEntries.map((entry) => [entry.contributorUserId, entry]));
  const names = new Map(people.map((person) => [person.id, person.displayName.split(/\s+/u).find(Boolean) ?? 'Anonymous']));
  const projectEntry = (userId: string): CardEntryInput => {
    const saved = savedByUser.get(userId);
    return saved ? {
      displayNameShown: saved.anonymous ? 'Anonymous' : saved.displayNameShown,
      anonymous: saved.anonymous, message: saved.message,
    } : { displayNameShown: names.get(userId) ?? 'Anonymous', anonymous: !names.has(userId), message: '' };
  };
  const entries = giftGivers.map(projectEntry);
  const pun = card?.pun ?? DETERMINISTIC_CARD_PUN;
  return {
    composer: {
      itemId, title: item.title, pun,
      tagline: card ? null : 'Plain card wording — no AI call.',
      entries, myEntry: savedByUser.has(actor.userId) ? projectEntry(actor.userId) : null,
    },
    artwork: {
      itemTitle: item.title, recipientName: recipient?.displayName.split(/\s+/u).find(Boolean) ?? 'You',
      occasion: circle.occasion, pun, entries,
    },
  };
}

/** Gift-giver projection only. Missing, ineligible, and owner requests share the same null. */
export async function getCard(tx: Tx, actor: Actor, itemId: string): Promise<CardComposerData | null> {
  return (await loadCardData(tx, actor, itemId))?.composer ?? null;
}

/** The actor never supplies the entry's identity; both create and update key it to the session. */
export async function saveCardEntry(tx: Tx, actor: Actor, itemId: string, input: CardEntryInput): Promise<void> {
  const accessible = await loadCardData(tx, actor, itemId);
  if (!accessible) throw new CardNotFoundError();
  const entry = validateCardEntry(input);
  const saved = { ...entry, displayNameShown: entry.anonymous ? 'Anonymous' : entry.displayNameShown };
  await tx.cardEntry.upsert({
    where: { itemId_contributorUserId: { itemId, contributorUserId: actor.userId } },
    create: { itemId, contributorUserId: actor.userId, ...saved },
    update: saved,
    select: { id: true },
  });
}

/** PNG bytes are never persisted to a public path; the private HTTP adapter owns delivery. */
export async function renderCard(db: Db, actor: Actor, itemId: string): Promise<Uint8Array> {
  return renderCardVariant(db, actor, itemId, 'screen');
}

export async function renderCardVariant(db: Db, actor: Actor, itemId: string, variant: CardVariant): Promise<Uint8Array> {
  const data = await db.withActor(actor, (tx) => loadCardData(tx, actor, itemId));
  if (!data) throw new CardNotFoundError();
  return (await renderCardArtwork(data.artwork, variant)).png;
}
