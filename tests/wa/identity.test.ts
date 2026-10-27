import { expect, it } from 'vitest';
import { selectActiveActor } from '@/server/wa/identity';

it('resolves only one trusted active membership and refuses circle ambiguity or owner-role mismatch', () => {
  const userId = '10000000-0000-4000-8000-000000000001';
  const owner = { circleId: '20000000-0000-4000-8000-000000000001', role: 'owner' as const, status: 'active', circle: { status: 'active', ownerUserId: userId } };
  expect(selectActiveActor(userId, [owner])).toEqual({ userId, circleId: owner.circleId, role: 'owner' });
  expect(selectActiveActor(userId, [owner, { ...owner, circleId: '20000000-0000-4000-8000-000000000002' }])).toBeNull();
  expect(selectActiveActor(userId, [{ ...owner, role: 'friend' }])).toBeNull();
  expect(selectActiveActor(userId, [{ ...owner, status: 'removed' }])).toBeNull();
});
