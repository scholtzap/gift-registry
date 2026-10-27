/**
 * Calendar arithmetic for the two dates a circle holds: the real birthday and the day the gift
 * is handed over (docs/plans/birthday-and-event-countdown.md).
 *
 * Pure and display-only by design. Nothing here unlocks a screen, gates a write, or infers an
 * age — a countdown that only counts has no way to spoil a gift, which is why it can live on the
 * most privacy-sensitive surface in the product.
 *
 * One zone, `Africa/Johannesburg`, as a product constant rather than a user setting: comparing
 * UTC calendar days would flip "Today" to "Tomorrow" on every evening request (SAST is UTC+2),
 * and a timezone picker would be a second concept nobody asked for.
 */

export const EVENT_ZONE = 'Africa/Johannesburg';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MS_PER_DAY = 86_400_000;

function isLeap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * A real calendar day in `YYYY-MM-DD`, which is stricter than `new Date(...)` — that accepts
 * 2026-02-30 by rolling it into March, and a rolling parser would silently store the wrong party
 * date. Leap-aware, because 29 February is a birthday like any other.
 */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = ISO_DATE.exec(value);
  if (!parts) return false;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  if (month < 1 || month > 12) return false;
  const last = month === 2 && isLeap(year) ? 29 : DAYS_IN_MONTH[month - 1]!;
  return day >= 1 && day <= last;
}

/** Epoch days for a calendar date, taken as UTC midnight so the difference is a whole number. */
function epochDay(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/** The calendar day the product lives in, for any instant. */
export function zoneDay(now: Date = new Date(), timeZone: string = EVENT_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

/** Whole days from `today` to `eventDate`; negative once the day has passed. */
export function daysUntil(eventDate: string, today: string = zoneDay()): number {
  const [ey, em, ed] = eventDate.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  return epochDay(ey, em, ed) - epochDay(ty, tm, td);
}

/**
 * The label beside the date. Singular and plural are this function's job, not string
 * concatenation in JSX, so "1 days to go" cannot exist anywhere in the product.
 */
export function countdownLabel(eventDate: string, today: string = zoneDay()): string {
  const days = daysUntil(eventDate, today);
  if (days < 0) return 'The day has passed';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days to go`;
}

/** `2026-12-05` to `Sat 5 Dec`, the human form that replaces the bare ISO string. */
export function humanDate(iso: string): string {
  const parts = ISO_DATE.exec(iso);
  if (!parts) return iso;
  const instant = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(instant);
}

/**
 * `3 Apr`, or `3 Apr 1996` when the owner supplied a year. No age arithmetic: an optional year
 * that turns into a computed number is exactly the "nothing that turns a year into a secret"
 * line the spec draws.
 */
export function birthdayLabel(birthMonth: number | null, birthDay: number | null, birthYear?: number | null): string | null {
  if (birthMonth === null || birthDay === null || birthMonth < 1 || birthMonth > 12 || birthDay < 1 || birthDay > 31) {
    return null;
  }
  // Year 2000 is a leap year, so 29 February formats instead of rolling over to 1 March.
  const instant = new Date(Date.UTC(birthYear ?? 2000, birthMonth - 1, birthDay));
  const label = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(instant);
  return birthYear ? `${label} ${birthYear}` : label;
}
