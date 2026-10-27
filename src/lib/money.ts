/**
 * Money is integer minor units plus an explicit currency, everywhere in the system. Floats
 * are not used for a pool that three people have to reconcile by hand.
 */
export function formatMinor(minor: number, currency = "ZAR"): string {
  const amount = (minor / 100).toFixed(2);
  if (currency === "ZAR") return `R${thousands(amount)}`;
  return `${currency} ${thousands(amount)}`;
}

function thousands(fixed: string): string {
  const [whole, decimals] = fixed.split(".");
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return decimals === undefined ? grouped : `${grouped}.${decimals}`;
}

export function toMinor(rand: number): number {
  return Math.round(rand * 100);
}
