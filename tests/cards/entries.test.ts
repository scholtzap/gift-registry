import { describe, expect, it } from 'vitest';
import { validateCardEntry } from '@/server/cards/validation';

describe('card entry input boundary', () => {
  it('preserves a gift-giver\'s literal name and words', () => {
    const input = { displayNameShown: 'Thabo & Lerato', message: '  <b>Enjoy</b> & keep shining!  ', anonymous: false };
    expect(validateCardEntry(input)).toEqual(input);
  });

  it('accepts the exact 80-name and 200-message Unicode-character limits', () => {
    const input = { displayNameShown: 'N'.repeat(80), message: '\u{1f389}'.repeat(200), anonymous: false };
    expect(validateCardEntry(input)).toEqual(input);
  });

  it('allows an anonymous gift-giver to leave the displayed name blank', () => {
    expect(validateCardEntry({ displayNameShown: '', message: 'Enjoy!', anonymous: true }))
      .toEqual({ displayNameShown: '', message: 'Enjoy!', anonymous: true });
  });

  it('does not normalise, trim, or rewrite non-URL saved text', () => {
    const input = { displayNameShown: '  Naledi\u0301  ', message: '  \uff25njoy\u200b!\r\nWith love\t  ', anonymous: false };
    expect(validateCardEntry(input)).toEqual(input);
  });

  it.each([
    'https://example.test/deal', 'www.example.test', 'example.test/deal',
    '192.0.2.1/deal', '192.0.2.1:8080/deal', '192.0.2.1?deal=1',
    '[2001:db8::1]/deal', '[::1]:8080/deal', '[::ffff:192.0.2.1]/deal',
    '2001:db8::1/deal', '::1/deal', '[fe80::1%25eth0]/deal',
    '\uff11\uff19\uff12\u3002\uff10\u3002\uff12\u3002\uff11/deal',
    '192.0.\u200b2.1/deal',
  ])('rejects URL/IP-bearing names and messages without changing the input: %s', (url) => {
    for (const field of ['displayNameShown', 'message'] as const) {
      for (const anonymous of [false, true]) {
        const input = { displayNameShown: 'Thabo', message: 'Enjoy!', anonymous, [field]: `See ${url}` };
        const before = { ...input };
        expect(() => validateCardEntry(input)).toThrow('invalid_card_entry');
        expect(input).toEqual(before);
      }
    }
  });

  it.each(['Happy 30th!', 'Meet at 19:30', 'Version 1.2.3', 'Score 192.0 out of 200', 'A:B:C'])('keeps ordinary non-link punctuation: %s', (message) => {
    const input = { displayNameShown: 'Thabo', message, anonymous: false };
    expect(validateCardEntry(input)).toEqual(input);
  });

  it.each([
    { displayNameShown: 'N'.repeat(81), message: 'Enjoy', anonymous: false },
    { displayNameShown: 'Thabo', message: 'x'.repeat(201), anonymous: false },
    { displayNameShown: '   ', message: 'Enjoy', anonymous: false },
    { displayNameShown: 'Thabo', message: 'Enjoy', anonymous: 'false' },
    { displayNameShown: 'Thabo', message: 123, anonymous: false },
    { displayNameShown: 'Thabo', message: 'Enjoy\u0000', anonymous: false },
    { displayNameShown: 'Thabo', message: 'Enjoy\ud800', anonymous: false },
    { displayNameShown: 'Thabo\u0000', message: 'Enjoy', anonymous: false },
    { displayNameShown: 'Thabo', message: 'Enjoy', anonymous: false, contributorUserId: 'someone-else' },
    null,
  ])('rejects invalid entries without accepting identity overrides', (input) => {
    expect(() => validateCardEntry(input)).toThrow('invalid_card_entry');
  });

  it.each([
    'See https://example.test/deal',
    'See HTTP://example.test',
    'www.example.test',
    'example.com/cheaper',
    '<a href="//example.test">click</a>',
    'mailto:gifts@example.test',
    'https:\u200b//example.test',
    'https://example\uff0etest',
  ])('rejects a URL-bearing message: %s', (message) => {
    expect(() => validateCardEntry({ displayNameShown: 'Thabo', message, anonymous: false })).toThrow('invalid_card_entry');
  });
});
