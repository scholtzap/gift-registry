/**
 * Money is integer minor units plus an explicit currency, everywhere in the system. Floats
 * are not used for a pool that three people have to reconcile by hand.
 */

// Digit groups are joined with a no-break space so an amount never wraps across two lines, in
// HTML, in a PNG card or in a WhatsApp reply. DESIGN.md: "numbers never break".
const NBSP = ' ';

export function formatMinor(minor: number, currency = "ZAR"): string {
  // Whole rands read as "R4 200"; cents only appear when there are some.
  const amount = minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
  if (currency === "ZAR") return `R${thousands(amount)}`;
  return `${currency}${NBSP}${thousands(amount)}`;
}

function thousands(fixed: string): string {
  const [whole, decimals] = fixed.split(".");
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return decimals === undefined ? grouped : `${grouped}.${decimals}`;
}

export function toMinor(rand: number): number {
  return Math.round(rand * 100);
}

/** The value a rand input is prefilled with: "1899" or "1249.50", never grouped. */
export function minorToRandInput(minor: number): string {
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

const MAX_MINOR = 2147483647;

/**
 * What a person typed in a rand field, as integer cents, or null when it is not an amount.
 * Accepts "400", "R 400", "1 250", "99.50" and "99,50" (comma as the decimal mark). Comma
 * grouping like "1,250" is ambiguous and rejected. String parsing only, no floats.
 */
export function parseRandToMinor(input: unknown): number | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/[\s  ]/g, '').replace(/^R/i, '').replace(',', '.');
  const match = /^(0|[1-9]\d{0,7})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return minor <= MAX_MINOR ? minor : null;
}
