import { describe, expect, it } from 'vitest';
import { birthdayLabel, countdownLabel, daysUntil, humanDate, isCalendarDate, zoneDay } from '@/lib/dates';

/**
 * The countdown is display-only, so the only way it can hurt is by being wrong about which day
 * it is. Every case here runs on a fixed clock: nothing in this file may depend on the machine's
 * real date, or the suite would pass on one day and fail the next.
 */

describe('zoneDay', () => {
  it('is the local calendar day, not the UTC one', () => {
    // 2026-11-17T21:00Z is 23:00 in Johannesburg on the 17th; 2026-11-18T01:00Z is already the 18th.
    expect(zoneDay(new Date('2026-11-17T21:00:00.000Z'))).toBe('2026-11-17');
    expect(zoneDay(new Date('2026-11-17T22:30:00.000Z'))).toBe('2026-11-18');
    expect(zoneDay(new Date('2026-11-18T00:30:00.000Z'))).toBe('2026-11-18');
  });

  it('pads to a fixed-width ISO day', () => {
    expect(zoneDay(new Date('2026-01-05T08:00:00.000Z'))).toBe('2026-01-05');
  });
});

describe('countdownLabel', () => {
  it('counts whole days ahead', () => {
    expect(countdownLabel('2026-11-30', '2026-11-18')).toBe('12 days to go');
    expect(daysUntil('2026-11-30', '2026-11-18')).toBe(12);
  });

  it('names the day itself and the day before it', () => {
    expect(countdownLabel('2026-11-18', '2026-11-18')).toBe('Today');
    expect(countdownLabel('2026-11-19', '2026-11-18')).toBe('Tomorrow');
  });

  it('never says "1 days to go"', () => {
    expect(countdownLabel('2026-11-19', '2026-11-18')).not.toMatch(/\b1 days\b/);
    expect(countdownLabel('2026-11-20', '2026-11-18')).toBe('2 days to go');
  });

  it('says the day has passed rather than counting into negatives', () => {
    expect(countdownLabel('2026-11-17', '2026-11-18')).toBe('The day has passed');
    expect(countdownLabel('2026-11-17', '2026-11-18')).not.toContain('-');
    expect(daysUntil('2026-11-19', '2026-11-20')).toBe(-1);
  });

  it('holds across a month and a year boundary', () => {
    expect(countdownLabel('2027-01-02', '2026-12-31')).toBe('2 days to go');
    expect(countdownLabel('2026-12-01', '2026-11-30')).toBe('Tomorrow');
  });
});

describe('humanDate', () => {
  it('renders the weekday and day without an ISO string', () => {
    expect(humanDate('2026-11-18')).toBe('Wed 18 Nov');
    expect(humanDate('2026-12-05')).toBe('Sat 5 Dec');
  });

  it('leaves a value it cannot read alone instead of throwing', () => {
    expect(humanDate('not-a-date')).toBe('not-a-date');
  });
});

describe('birthdayLabel', () => {
  it('needs a month and a day, and adds the year only when it was given', () => {
    expect(birthdayLabel(4, 3)).toBe('3 Apr');
    expect(birthdayLabel(4, 3, 1996)).toBe('3 Apr 1996');
    expect(birthdayLabel(null, 3)).toBeNull();
    expect(birthdayLabel(4, null)).toBeNull();
    expect(birthdayLabel(13, 1)).toBeNull();
  });

  it('keeps 29 February a day rather than rolling it into March', () => {
    expect(birthdayLabel(2, 29)).toBe('29 Feb');
    expect(birthdayLabel(2, 29, 1996)).toBe('29 Feb 1996');
  });
});

describe('isCalendarDate', () => {
  it('accepts a real ISO day', () => {
    for (const value of ['2026-11-18', '2026-02-28', '2028-02-29', '2026-12-31']) {
      expect(isCalendarDate(value), value).toBe(true);
    }
  });

  it('refuses the day that does not exist, the shape that is not ISO, and nothing at all', () => {
    for (const value of ['2026-02-30', '2026-02-29', '18/11/2026', '2026-11-32', '2026-13-01', '2026-11-18T00:00:00Z', '', '   ', 'null']) {
      expect(isCalendarDate(value), value).toBe(false);
    }
  });

  it('is leap-aware', () => {
    expect(isCalendarDate('2024-02-29')).toBe(true);
    expect(isCalendarDate('1900-02-29')).toBe(false);
    expect(isCalendarDate('2000-02-29')).toBe(true);
  });

  it('refuses a non-string without throwing', () => {
    expect(isCalendarDate(new Date('2026-11-18'))).toBe(false);
    expect(isCalendarDate(null)).toBe(false);
  });
});
