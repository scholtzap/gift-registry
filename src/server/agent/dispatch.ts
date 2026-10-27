import type { Actor, Tx } from '@/server/db/client';
import { claimItem, contribute } from '@/server/ledger';
import { validateCardEntry } from '@/server/cards/validation';
import { cardConfirmationReply, FIXED_MENU, type TaskIntent } from './tasks';
import { buildAgentContext, formatStatus } from './status';

/** Deterministic tasks only. No model is handed a tool, chosen task, or state transition. */
export async function dispatchTask(tx: Tx, actor: Actor, intent: TaskIntent): Promise<string> {
  if (intent.task === 'check_status') {
    const context = await buildAgentContext(tx, actor);
    return context ? formatStatus(context) : FIXED_MENU;
  }
  if (intent.task === 'claim_or_pool') {
    if (intent.action === 'not_now' || actor.role !== 'friend') return FIXED_MENU;
    if (intent.action === 'claim') { await claimItem(tx, actor, intent.itemId); return 'Piñata AI: Your claim is recorded.'; }
    await contribute(tx, actor, intent.poolId, intent.amountMinor);
    return 'Piñata AI: Your promised pool contribution is recorded. Settle manually; no money is held.';
  }
  if (intent.task === 'write_card_message') {
    if (actor.role !== 'friend' || !actor.circleId) return FIXED_MENU;
    const context = await buildAgentContext(tx, actor);
    if (!context || context.role !== 'friend') return FIXED_MENU;
    const item = await tx.item.findFirst({ where: { id: intent.itemId, circleId: actor.circleId }, select: { id: true } });
    if (!item) return FIXED_MENU;
    const [claim, contribution] = await Promise.all([
      tx.claim.findFirst({ where: { itemId: item.id, userId: actor.userId, status: { in: ['claimed', 'fulfilled'] } }, select: { id: true } }),
      tx.contribution.findFirst({ where: { userId: actor.userId, pool: { itemId: item.id } }, select: { id: true } }),
    ]);
    if (!claim && !contribution) return FIXED_MENU;
    const entry = validateCardEntry({ displayNameShown: intent.displayNameShown, message: intent.message, anonymous: intent.anonymous });
    // Preview is returned to this actor only; the system never delivers a card or reveal.
    if (!intent.confirmed) return `Piñata AI: Your card line: ${entry.message}\nConfirm it in your circle before saving.`;
    const previous = await tx.cardEntry.findUnique({ where: { itemId_contributorUserId: { itemId: item.id, contributorUserId: actor.userId } } });
    if (!previous) {
      const saved = await tx.cardEntry.create({ data: { itemId: item.id, contributorUserId: actor.userId, ...entry } });
      await tx.ledgerEvent.create({ data: { circleId: actor.circleId, actorUserId: actor.userId, entity: 'card_entry', entityId: saved.id, action: 'card_entry.created' } });
    }
    return cardConfirmationReply(entry, previous);
  }
  return FIXED_MENU;
}
