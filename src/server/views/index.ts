import type { Tx } from '@/server/db/client';
import { formatMinor } from '@/lib/money';
import { birthdayLabel, countdownLabel, daysUntil, humanDate, zoneDay } from '@/lib/dates';

/**
 * The only place that knows which fields a role may see. RLS decides which *rows* exist for
 * a role; this decides which *columns* are rendered — and it is the difference between
 * "the owner cannot query claims" and "the owner is never shown a number that implies one".
 *
 * Both builders return `null` when the circle is not visible to the caller's role. That null
 * is deliberate and it is the same null for "does not exist" and "not yours": the route turns
 * it into a 404, never a 403, because a 403 tells a curious owner that something is in there.
 */

/**
 * The two dates, already turned into what each role is allowed to read.
 *
 * `eventDate` is a *writer-dependent* column: the row carries one value and the owner sees it
 * only when they were the one who wrote it. RLS filters rows and the app role holds a table-wide
 * SELECT on `circles` (`001_roles.sql`), so no policy can express that — this builder is the
 * guard, and `tests/leak/event-date-secrecy.test.ts` asserts the rendered HTML is the proof.
 * The writer's identity itself stops here: no projection renders which friend set it, because a
 * name on a surprise is a spoiler and nothing about coordinating the gift needs it.
 */
interface CircleDates {
  /** ISO `YYYY-MM-DD` when this role may see the event date, else null. */
  eventDate: string | null;
  /** `Sat 5 Dec` — the human form that replaced the bare ISO string. */
  eventDateLabel: string | null;
  /** `12 days to go`. Display only: it unlocks nothing and gates nothing. */
  countdown: string | null;
  /** `3 Apr`, or with a year when the owner gave one. Never an age. */
  birthday: string | null;
}

function circleDates(circle: {
  eventDate: Date | null;
  eventDateSetByUserId: string | null;
  ownerUserId: string;
  birthMonth: number | null;
  birthDay: number | null;
  birthYear: number | null;
}, showEventDate: boolean, today: string): CircleDates {
  const iso = showEventDate && circle.eventDate !== null ? circle.eventDate.toISOString().slice(0, 10) : null;
  return {
    eventDate: iso,
    eventDateLabel: iso === null ? null : humanDate(iso),
    countdown: iso === null ? null : countdownLabel(iso, today),
    birthday: birthdayLabel(circle.birthMonth, circle.birthDay, circle.birthYear),
  };
}

export interface OwnerItemView {
  id: string;
  title: string;
  retailer: string | null;
  price: string | null;
  confirmed: boolean;
}

export interface OwnerCircleView extends CircleDates {
  name: string;
  occasion: string;
  shareSlug: string;
  items: OwnerItemView[];
  attributes: { kind: string; valueText: string; unit: string | null }[];
}

export interface FriendItemView {
  id: string;
  title: string;
  retailer: string | null;
  price: string | null;
  status: 'active' | 'tombstoned' | 'revealed';
  tombstoneReason: string | null;
  secret: boolean;
  addedByMe: boolean;
  claimedByMe: boolean;
  /** F14: a friend may hand this secret suggestion over now — event passed, no author veto. */
  canReveal: boolean;
  pool: {
    id: string;
    target: string;
    settled: string;
    // The same amounts as integers, for the progress meter only. Both projections already see
    // the formatted strings, so the numerics expose nothing the render does not.
    targetMinor: number;
    settledMinor: number;
    currency: string;
    status: string;
    iAmBuyer: boolean;
    contributors: number;
  } | null;
}

export interface FriendCircleView extends CircleDates {
  name: string;
  occasion: string;
  items: FriendItemView[];
  attributes: { kind: string; valueText: string; unit: string | null }[];
}

export async function ownerCircleView(tx: Tx, circleId: string, now: Date = new Date()): Promise<OwnerCircleView | null> {
  const circle = await tx.circle.findUnique({
    where: { id: circleId },
    include: {
      items: { orderBy: { createdAt: 'asc' } },
      // `select`, not a bare `include`: Prisma expands an included relation into every column of
      // the table, and `users.phone_e164` / `users.bsuid` are revoked from the app roles on
      // purpose (001_roles.sql). A bare include here would raise 42501 at the first read.
      owner: { select: { attributes: { orderBy: { kind: 'asc' } } } },
    },
  });
  if (circle === null) return null;

  return {
    name: circle.name,
    occasion: circle.occasion,
    // A date a friend wrote is not the owner's to see — not the day, not the count, not a
    // sentence explaining the gap. Silence reads as "not set yet", which is the same
    // false-but-harmless reading the reduced item projection already gives for claims and pools.
    ...circleDates(circle, circle.eventDateSetByUserId === circle.ownerUserId, zoneDay(now)),
    shareSlug: circle.shareSlug,
    // RLS has already removed friend-only suggestions and the owner's own tombstones.
    items: circle.items.map((item) => ({
      id: item.id,
      title: item.title,
      retailer: item.retailer,
      price: item.priceMinor === null ? null : formatMinor(item.priceMinor, item.currency),
      confirmed: item.confirmed,
    })),
    attributes: circle.owner.attributes.map((a) => ({ kind: a.kind, valueText: a.valueText, unit: a.unit })),
  };
}

export async function friendCircleView(tx: Tx, circleId: string, viewerUserId: string, now: Date = new Date()): Promise<FriendCircleView | null> {
  const circle = await tx.circle.findUnique({
    where: { id: circleId },
    include: {
      items: {
        orderBy: { createdAt: 'asc' },
        include: {
          claims: true,
          pools: { include: { contributions: true } },
        },
      },
      owner: { select: { attributes: { orderBy: { kind: 'asc' } } } },
    },
  });
  if (circle === null) return null;

  return {
    name: circle.name,
    occasion: circle.occasion,
    // Friends see the party date whenever it is set, and the real birthday always — a wish that
    // lands on the wrong day is worse than a wish that lands late.
    ...circleDates(circle, true, zoneDay(now)),
    items: circle.items.map((item) => {
      const pool = item.pools.find((p) => p.status !== 'purchased') ?? null;
      const myClaim = item.claims.find((c) => c.userId === viewerUserId && c.status === 'claimed') ?? null;
      const settledMinor = pool === null
        ? 0
        : pool.contributions.reduce((sum, c) => sum + (c.status === 'settled' ? c.amountMinor : 0), 0);
      return {
        id: item.id,
        title: item.title,
        retailer: item.retailer,
        price: item.priceMinor === null ? null : formatMinor(item.priceMinor, item.currency),
        status: item.status,
        tombstoneReason: item.tombstoneReason,
        secret: item.visibility === 'friend_only',
        addedByMe: item.addedByUserId === viewerUserId,
        claimedByMe: myClaim !== null,
        canReveal: item.status === 'active' && item.visibility === 'friend_only' && item.revealOk
          && circle.eventDate !== null && daysUntil(circle.eventDate.toISOString().slice(0, 10), zoneDay(now)) < 0,
        pool:
          pool === null
            ? null
            : {
                id: pool.id,
                target: formatMinor(pool.targetMinor, pool.currency),
                // Settled, not promised: the buyer is the one who fronted the cash, so the
                // number next to the pool is what has actually landed, not what was pledged.
                settled: formatMinor(settledMinor, pool.currency),
                targetMinor: pool.targetMinor,
                settledMinor,
                currency: pool.currency,
                status: pool.status,
                iAmBuyer: pool.buyerUserId === viewerUserId,
                contributors: pool.contributions.length,
              },
      };
    }),
    attributes: circle.owner.attributes
      .filter((a) => a.visibility === 'friends')
      .map((a) => ({ kind: a.kind, valueText: a.valueText, unit: a.unit })),
  };
}
