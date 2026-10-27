import { isIP } from 'node:net';

export interface CardEntryInput {
  displayNameShown: string;
  message: string;
  anonymous: boolean;
}

export class CardEntryValidationError extends Error {
  constructor() {
    super('invalid_card_entry');
    this.name = 'CardEntryValidationError';
  }
}

// Normalisation is for URL detection only; the stored words are never rewritten.
export function containsCardUrl(text: string): boolean {
  const inspected = text.normalize('NFKC').replace(/\p{Cf}/gu, '').replace(/\u3002/gu, '.');
  if (/(?:[a-z][a-z0-9+.-]*:\s*\/\/|\b(?:https?|ftp|mailto|data|javascript):|www\.|(?:^|[\s<("'=])\/\/|\b[\p{L}\p{N}](?:[\p{L}\p{N}-]*\.)+[\p{L}]{2,63}\b)/iu.test(inspected)) return true;
  const ipv4 = inspected.matchAll(/(?<![\p{L}\p{N}.])(?:\d{1,3}\.){3}\d{1,3}(?![\p{L}\p{N}]|\.\d)/gu);
  for (const [address] of ipv4) if (isIP(address) === 4) return true;
  const ipv6 = inspected.matchAll(/\[[0-9a-f:.]+(?:%[0-9a-z_.~-]+)?\]|(?<![\p{L}\p{N}:])[0-9a-f:.]*:[0-9a-f:.]+(?:%[0-9a-z_.~-]+)?/giu);
  for (const [candidate] of ipv6) {
    const address = candidate.replace(/^\[|\]$/g, '').split('%')[0]!.replace(/\.+$/, '');
    if (isIP(address) === 6) return true;
  }
  return false;
}

export function containsInvalidCardText(text: string): boolean {
  return Array.from(text).some((character) => {
    const code = character.codePointAt(0)!;
    return (code < 32 && ![9, 10, 13].includes(code)) || (code >= 0xD800 && code <= 0xDFFF)
      || code === 0xFFFE || code === 0xFFFF;
  });
}

export function validateCardEntry(input: unknown): CardEntryInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CardEntryValidationError();
  const entry = input as Record<string, unknown>;
  if (Object.keys(entry).some((key) => !['displayNameShown', 'message', 'anonymous'].includes(key))) {
    throw new CardEntryValidationError();
  }
  const { displayNameShown, message, anonymous } = entry;
  if (typeof displayNameShown !== 'string' || typeof message !== 'string' || typeof anonymous !== 'boolean'
    || (!anonymous && displayNameShown.trim().length === 0) || Array.from(displayNameShown).length > 80
    || Array.from(message).length > 200 || containsCardUrl(displayNameShown) || containsCardUrl(message)
    || containsInvalidCardText(displayNameShown) || containsInvalidCardText(message)) {
    throw new CardEntryValidationError();
  }
  return { displayNameShown, message, anonymous };
}
