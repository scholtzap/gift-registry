import type { BadgeTone } from '@/components/ui';
import { formatMinor } from '@/lib/money';
import type { FriendItemView } from '@/server/views';

// Plain-language status for the friend projection, shared by the ledger row and the item page so
// one state never reads two ways. Every label is derived from fields the friend view already
// carries; nothing here infers another friend's claim, pledge or payment.

type Pool = NonNullable<FriendItemView['pool']>;

export function poolPercent(pool: Pool): number {
  return pool.targetMinor > 0 ? Math.round((pool.settledMinor / pool.targetMinor) * 100) : 0;
}

/** Target minus settled, never below zero. */
export function remainingMinor(pool: Pool): number {
  return Math.max(0, pool.targetMinor - pool.settledMinor);
}

const tombstoneLabels: Record<string, string> = {
  bought_self: 'They bought it themselves',
  no_longer_wants: 'Off their list',
  duplicate: 'Removed as a duplicate',
};

/** Friend wording for one contribution row. Single source for the ledger, item page and share page. */
export function contributionStatusLabel(status: string): string {
  if (status === 'promised') return 'Not yet paid';
  return 'Marked paid';
}

/** Friend wording for the viewer's own pledge line. */
export function ownPledgeStatusLabel(status: string): string {
  if (status === 'promised') return 'pledged, not yet paid';
  return 'marked paid';
}

/** Long-form tombstone copy for the item page notice. Short badge labels stay in `tombstoneLabels`. */
export function tombstoneCopy(reason: string | null): string {
  if (reason === 'bought_self') return 'They bought this themselves.';
  if (reason === 'no_longer_wants') return 'They no longer want this gift.';
  if (reason === 'duplicate') return 'This was a duplicate gift.';
  return 'This gift was removed from their list.';
}

export function itemStatus(item: FriendItemView): { label: string; tone: BadgeTone } {
  if (item.status === 'tombstoned') return { label: tombstoneLabels[item.tombstoneReason ?? ''] ?? 'Off their list', tone: 'alert' };
  if (item.status === 'revealed') return { label: 'Revealed', tone: 'done' };
  const pool = item.pool;
  if (pool !== null) {
    if (pool.status === 'pivot_needed') return { label: 'Needs a new plan', tone: 'alert' };
    if (pool.status === 'purchased') return { label: 'Bought', tone: 'done' };
    if (pool.status === 'funded') return { label: 'Fully pooled', tone: 'done' };
    if (pool.status === 'open') return { label: `Pooling · ${formatMinor(remainingMinor(pool), pool.currency)} to go`, tone: 'money' };
    return { label: 'Pool paused', tone: 'neutral' };
  }
  if (item.claimedByMe) return { label: 'You’re buying it', tone: 'done' };
  return { label: 'No pool yet', tone: 'open' };
}
