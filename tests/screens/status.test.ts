import { describe, expect, it } from 'vitest';
import { contributionStatusLabel, ownPledgeStatusLabel, tombstoneCopy } from '@/components/status';

/**
 * Friend wording lives only in `src/components/status.ts` — one source so the
 * ledger row, the item page and the share page can never disagree. These cases
 * pin the three helpers the screens share.
 */

describe('contributionStatusLabel', () => {
  it('names the unpaid state', () => {
    expect(contributionStatusLabel('promised')).toBe('Not yet paid');
  });

  it('names every paid state the same', () => {
    expect(contributionStatusLabel('marked_paid')).toBe('Marked paid');
    expect(contributionStatusLabel('settled')).toBe('Marked paid');
  });
});

describe('ownPledgeStatusLabel', () => {
  it('reads as the viewer describing their own pledge', () => {
    expect(ownPledgeStatusLabel('promised')).toBe('pledged, not yet paid');
    expect(ownPledgeStatusLabel('marked_paid')).toBe('marked paid');
  });
});

describe('tombstoneCopy', () => {
  it('explains each removal reason in plain words', () => {
    expect(tombstoneCopy('bought_self')).toBe('They bought this themselves.');
    expect(tombstoneCopy('no_longer_wants')).toBe('They no longer want this gift.');
    expect(tombstoneCopy('duplicate')).toBe('This was a duplicate gift.');
  });

  it('falls back for unknown reasons', () => {
    expect(tombstoneCopy(null)).toBe('This gift was removed from their list.');
    expect(tombstoneCopy('other')).toBe('This gift was removed from their list.');
  });
});
