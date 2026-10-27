import { describe, expect, it } from 'vitest';
import { formatMinor, minorToRandInput, parseRandToMinor } from '@/lib/money';

describe('formatMinor', () => {
  it('joins digit groups with a no-break space so an amount never wraps', () => {
    expect(formatMinor(365000)).toBe('R3 650');
    expect(formatMinor(123456789)).toBe('R1 234 567.89');
    expect(formatMinor(365000)).not.toMatch(/ /);
  });

  it('drops .00 on whole rands and keeps cents when there are some', () => {
    expect(formatMinor(0)).toBe('R0');
    expect(formatMinor(40000)).toBe('R400');
    expect(formatMinor(124950)).toBe('R1 249.50');
  });

  it('keeps a non-ZAR code joined to its amount', () => {
    expect(formatMinor(250000, 'USD')).toBe('USD 2 500');
  });
});

describe('parseRandToMinor', () => {
  it.each([
    ['400', 40000],
    ['R 400', 40000],
    ['r400', 40000],
    ['1 250', 125000],
    ['1 250', 125000],
    ['99.5', 9950],
    ['99,50', 9950],
    ['0', 0],
    [' 12.05 ', 1205],
  ])('reads %j as %i cents', (input, minor) => {
    expect(parseRandToMinor(input)).toBe(minor);
  });

  it.each(['', 'R', '1,250', '12.345', '-5', '1e3', '01', 'abc', '400 rand', '999999999'])('rejects %j', (input) => {
    expect(parseRandToMinor(input)).toBeNull();
  });

  it('rejects anything that is not a string', () => {
    expect(parseRandToMinor(null)).toBeNull();
    expect(parseRandToMinor(400)).toBeNull();
  });

  it('round-trips with the value an input is prefilled with', () => {
    for (const minor of [0, 100, 9950, 124950, 420000]) {
      expect(parseRandToMinor(minorToRandInput(minor))).toBe(minor);
    }
  });
});
