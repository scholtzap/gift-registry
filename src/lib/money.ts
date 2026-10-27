/**
 * Money is integer minor units plus an explicit currency, everywhere in the system. Floats
 * are not used for a pool that three people have to reconcile by hand.
 */

// Digit groups never contain a breakable space, so an amount never wraps across two lines, in
// HTML, in a PNG card or in a WhatsApp reply. DESIGN.md: "numbers never break".
const NBSP = ' ';

/** Currencies an item can be priced in. Every pool and contribution inherits its item's. */
export const CURRENCIES = ['USD', 'ZAR', 'EUR', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = 'USD';

const STYLE: Record<Currency, { symbol: string; group: string; decimalComma: boolean; name: string }> = {
  USD: { symbol: '$', group: ',', decimalComma: false, name: 'US dollar' },
  ZAR: { symbol: 'R', group: NBSP, decimalComma: true, name: 'South African rand' },
  EUR: { symbol: '€', group: ',', decimalComma: true, name: 'Euro' },
  GBP: { symbol: '£', group: ',', decimalComma: false, name: 'British pound' },
};

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value);
}

/** "$", "R", "€", "£", or the ISO code for anything else. */
export function currencySymbol(currency: string): string {
  return isCurrency(currency) ? STYLE[currency].symbol : currency;
}

/** "US dollar ($)" for a picker label. */
export function currencyLabel(currency: Currency): string {
  return `${STYLE[currency].name} (${STYLE[currency].symbol})`;
}

export function formatMinor(minor: number, currency: string = DEFAULT_CURRENCY): string {
  // Whole units read as "$4,200"; cents only appear when there are some.
  const amount = minorToInput(minor);
  if (isCurrency(currency)) return `${STYLE[currency].symbol}${group(amount, STYLE[currency].group)}`;
  return `${currency}${NBSP}${group(amount, NBSP)}`;
}

function group(fixed: string, separator: string): string {
  const [whole, decimals] = fixed.split(".");
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  return decimals === undefined ? grouped : `${grouped}.${decimals}`;
}

export function toMinor(units: number): number {
  return Math.round(units * 100);
}

/** The value an amount input is prefilled with: "1899" or "1249.50", never grouped. */
export function minorToInput(minor: number): string {
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

const MAX_MINOR = 2147483647;

/**
 * What a person typed in an amount field, as integer minor units, or null when it is not an
 * amount in that currency. Accepts the symbol or code ("$400", "R 400", "USD 400") and spaces
 * between digit groups. Rand and euro read a comma as the decimal mark ("99,50"); dollars and
 * pounds read it as a thousands separator ("1,250"), and only in whole groups of three.
 * String parsing only, no floats.
 */
export function parseAmountToMinor(input: unknown, currency: string): number | null {
  if (typeof input !== 'string' || !isCurrency(currency)) return null;
  const style = STYLE[currency];
  let cleaned = input.replace(/[\s  ]/g, '');
  if (cleaned.toUpperCase().startsWith(currency)) cleaned = cleaned.slice(currency.length);
  else if (cleaned.startsWith(style.symbol) || cleaned.toUpperCase().startsWith(style.symbol.toUpperCase())) cleaned = cleaned.slice(style.symbol.length);
  if (style.decimalComma) {
    cleaned = cleaned.replace(',', '.');
  } else if (cleaned.includes(',')) {
    if (!/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(cleaned)) return null;
    cleaned = cleaned.replaceAll(',', '');
  }
  const match = /^(0|[1-9]\d{0,7})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return minor <= MAX_MINOR ? minor : null;
}
