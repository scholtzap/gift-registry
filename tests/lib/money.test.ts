import { describe, expect, it } from 'vitest';
import { CURRENCIES, DEFAULT_CURRENCY, currencySymbol, formatMinor, isCurrency, minorToInput, parseAmountToMinor } from '@/lib/money';

describe('formatMinor', () => {
  it('defaults to US dollars', () => {
    expect(DEFAULT_CURRENCY).toBe('USD');
    expect(formatMinor(420000)).toBe('$4,200');
  });

  it('formats each supported currency without a breakable space', () => {
    expect(formatMinor(124950, 'USD')).toBe('$1,249.50');
    expect(formatMinor(365000, 'ZAR')).toBe('R3 650');
    expect(formatMinor(123456789, 'ZAR')).toBe('R1 234 567.89');
    expect(formatMinor(250000, 'EUR')).toBe('€2,500');
    expect(formatMinor(9950, 'GBP')).toBe('£99.50');
    for (const code of CURRENCIES) expect(formatMinor(123456700, code)).not.toMatch(/ /);
  });

  it('drops .00 on whole amounts and keeps cents when there are some', () => {
    expect(formatMinor(0, 'ZAR')).toBe('R0');
    expect(formatMinor(40000, 'USD')).toBe('$400');
  });

  it('keeps an unknown code joined to its amount', () => {
    expect(formatMinor(250000, 'JPY')).toBe('JPY 2 500');
    expect(currencySymbol('JPY')).toBe('JPY');
    expect(isCurrency('JPY')).toBe(false);
  });
});

describe('parseAmountToMinor', () => {
  it.each([
    ['400', 'USD', 40000],
    ['$400', 'USD', 40000],
    ['USD 400', 'USD', 40000],
    ['1,250', 'USD', 125000],
    ['$1,249.50', 'USD', 124950],
    ['£99.5', 'GBP', 9950],
    ['R 400', 'ZAR', 40000],
    ['r400', 'ZAR', 40000],
    ['1 250', 'ZAR', 125000],
    ['1 250', 'ZAR', 125000],
    ['99,50', 'ZAR', 9950],
    ['€12,05', 'EUR', 1205],
    ['0', 'USD', 0],
  ])('reads %j in %s as %i cents', (input, currency, minor) => {
    expect(parseAmountToMinor(input, currency)).toBe(minor);
  });

  it.each([
    ['', 'USD'], ['$', 'USD'], ['1,25', 'USD'], ['12,34,567', 'USD'], ['12.345', 'USD'], ['-5', 'USD'],
    ['1e3', 'USD'], ['01', 'USD'], ['400 dollars', 'USD'], ['999999999', 'USD'], ['R400', 'USD'],
    ['1,250', 'ZAR'], ['$400', 'ZAR'], ['400', 'JPY'],
  ])('rejects %j in %s', (input, currency) => {
    expect(parseAmountToMinor(input, currency)).toBeNull();
  });

  it('rejects anything that is not a string', () => {
    expect(parseAmountToMinor(null, 'USD')).toBeNull();
    expect(parseAmountToMinor(400, 'USD')).toBeNull();
  });

  it('round-trips with the value an input is prefilled with', () => {
    for (const code of CURRENCIES) {
      for (const minor of [0, 100, 9950, 124950, 420000]) {
        expect(parseAmountToMinor(minorToInput(minor), code)).toBe(minor);
      }
    }
  });
});
