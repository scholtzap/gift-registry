import { expect, it } from 'vitest';
import { formatStatus } from '@/server/agent/status';

it('formats owner status solely from want counts, never from a friend claim or pool projection', () => {
  expect(formatStatus({ role: 'owner', wants: 3, unconfirmed: 1 })).toBe('Piñata AI: You have 3 wants, 1 unconfirmed.');
});
