import type { Actor, Db } from '@/server/db/client';
import type { SenderIdentity } from './protocol';

export interface MembershipContext { circleId: string; role: 'owner' | 'friend'; status: string; circle: { status: string; ownerUserId: string } }
export function selectActiveActor(userId: string, memberships: MembershipContext[]): Actor | null {
  const active = memberships.filter(m => m.status === 'active' && m.circle.status === 'active');
  if (active.length !== 1) return null;
  const member = active[0]!;
  if ((member.role === 'owner') !== (member.circle.ownerUserId === userId)) return null;
  return { userId, circleId: member.circleId, role: member.role };
}

/** Login-role reads are limited to identity and membership, never the gift ledger. No auto-join. */
export async function resolveSender(db: Db, identity: SenderIdentity): Promise<Actor | null> {
  const user = identity.bsuid
    ? await db.prisma.user.findUnique({ where: { bsuid: identity.bsuid }, select: { id: true } })
    : identity.phoneE164 ? await db.prisma.user.findUnique({ where: { phoneE164: identity.phoneE164 }, select: { id: true } }) : null;
  if (!user) return null;
  return resolveMembership(db, user.id);
}

export async function resolveMembership(db: Db, userId: string, circleId?: string): Promise<Actor | null> {
  const memberships = await db.prisma.membership.findMany({
    where: { userId, status: 'active', ...(circleId ? { circleId } : {}), circle: { status: 'active' } },
    select: { circleId: true, role: true, status: true, circle: { select: { status: true, ownerUserId: true } } },
  });
  return selectActiveActor(userId, memberships);
}
