import type { Actor, Tx } from '@/server/db/client';

export type StatusContext = { role: 'owner'; wants: number; unconfirmed: number } | { role: 'friend'; unclaimed: string[] };
export function formatStatus(context: StatusContext): string {
  if (context.role === 'owner') return `Piñata AI: You have ${context.wants} wants, ${context.unconfirmed} unconfirmed.`;
  return context.unclaimed.length ? `Piñata AI: Still unclaimed: ${context.unclaimed.join('; ')}.` : 'Piñata AI: No unclaimed wants.';
}

/** Explicit branches: the owner is never handed friend state to summarise. */
export async function buildAgentContext(tx: Tx, actor: Actor): Promise<StatusContext | null> {
  if (!actor.circleId) return null;
  const circle = await tx.circle.findFirst({ where: { id: actor.circleId, status: 'active' }, select: { ownerUserId: true } });
  const member = await tx.membership.findFirst({ where: { circleId: actor.circleId, userId: actor.userId, role: actor.role, status: 'active' }, select: { id: true } });
  if (!circle || !member || (actor.role === 'owner') !== (circle.ownerUserId === actor.userId)) return null;
  if (actor.role === 'owner') {
    const [wants, pending] = await Promise.all([
      tx.item.count({ where: { circleId: actor.circleId, confirmed: true, status: { not: 'tombstoned' } } }),
      tx.ingestEvent.findMany({ where: { circleId: actor.circleId, userId: actor.userId, status: 'parsed', itemId: null }, select: { draft: true } }),
    ]);
    let unconfirmed = 0;
    for (const event of pending) {
      const draft = event.draft;
      if (draft && typeof draft === 'object' && !Array.isArray(draft) && Array.isArray(draft.candidates)) {
        unconfirmed += draft.candidates.filter(c => c && typeof c === 'object' && !Array.isArray(c) && c.state === 'pending').length;
      }
    }
    return { role: 'owner', wants, unconfirmed };
  }
  const items = await tx.item.findMany({
    where: { circleId: actor.circleId, confirmed: true, status: 'active', claims: { none: { status: { in: ['claimed', 'fulfilled'] } } }, pools: { none: {} } },
    select: { title: true }, orderBy: { createdAt: 'asc' }, take: 10,
  });
  return { role: 'friend', unclaimed: items.map(item => item.title.slice(0, 200)) };
}
