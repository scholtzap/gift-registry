import type { Tx } from '@/server/db/client';
import { formatMinor } from '@/lib/money';
import { payoutReference } from '@/server/ledger';
import { isStoredPhoto } from '@/server/photos';
import { birthdayLabel, countdownLabel, daysUntil, humanDate, zoneDay } from '@/lib/dates';
import { isRequestLive } from '@/server/lifecycle';

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
  ownerUserId: string | null;
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
  /** Owner projection: whether the wish has a product photo; the bytes are served by the route. */
  hasPhoto: boolean;
}

export interface OwnerCircleView extends CircleDates {
  name: string;
  occasion: string;
  shareSlug: string;
  items: OwnerItemView[];
  attributes: { kind: string; valueText: string; unit: string | null }[];
  /** RN-J: live permission requests. Owner projection only — the requester's
   * own untrusted words, found here when the owner next opens their link.
   * Nothing is ever sent to the owner. */
  accessRequests: { id: string; requesterName: string; requestedAt: string }[];
}

export interface FriendItemView {
  id: string;
  title: string;
  retailer: string | null;
  price: string | null;
  /** Friend projection: the item's currency, which any pool on it must use. The owner already
   * sees the formatted price, so the code exposes nothing new. */
  currency: string;
  /** Friend projection: whether the item has a product photo. */
  hasPhoto: boolean;
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
    /** Pledged (promised + marked paid + settled) across all contributions. Friends
     * coordinate around this; the owner never receives this projection at all. */
    pledged: string;
    pledgedMinor: number;
    /** The viewer's own pledge, or null. Rendered only to the pledger themselves:
     * seeing your own amount confirm is what makes a chip tap feel answered. */
    myContribution: {
      amount: string;
      amountMinor: number;
      status: 'promised' | 'marked_paid' | 'settled';
      reference: string;
    } | null;
    /** The buyer's bank details, only when the viewer pledged AND the buyer switched
     * sharing on (or the viewer is the buyer). Never present for the owner: their
     * projection has no pool object in the first place. */
    payout: {
      accountHolder: string;
      bankName: string;
      accountNumber: string;
      branchCode: string;
      accountType: string | null;
      referencePrefix: string | null;
      shareConsent: boolean;
    } | null;
    /** Buyer-only tally: one row per pledger with what they owe, what they paid,
     * and the reference they must use. Friends who are not the buyer get []. */
    tally: {
      userId: string;
      displayName: string;
      amount: string;
      amountMinor: number;
      status: 'promised' | 'marked_paid' | 'settled';
      reference: string;
    }[];
  } | null;
}

/**
 * The copy-paste settlement summary: bank details, then one line per pledger
 * with what they owe and the reference to use. Built only from data the
 * viewer was already allowed to see — the route gates the page itself.
 */
export function payoutShareText(itemTitle: string, pool: NonNullable<FriendItemView['pool']>): string {
  const lines = [
    `Piñata pool: ${itemTitle}`,
    `Target: ${pool.target}`,
    '',
    'Pay to:',
    `${pool.payout!.accountHolder}`,
    `${pool.payout!.bankName}`,
    `Account: ${pool.payout!.accountNumber}`,
    `Branch: ${pool.payout!.branchCode}`,
    ...(pool.payout!.accountType ? [`Account type: ${pool.payout!.accountType}`] : []),
    '',
    'Your share:',
  ];
  for (const row of pool.tally) {
    lines.push(`- ${row.displayName}: ${row.amount} (ref ${row.reference})${row.status === 'promised' ? '' : ' — paid ✓'}`);
  }
  if (pool.tally.length === 0 && pool.myContribution) {
    const mine = pool.myContribution;
    lines.push(`- You: ${mine.amount} (ref ${mine.reference})${mine.status === 'promised' ? '' : ' — paid ✓'}`);
  }
  lines.push('', 'Send the money outside Piñata, then mark your pledge paid on the gift page.');
  return lines.join('\n');
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
      hasPhoto: isStoredPhoto(item.imagePath),
    })),
    // Proxy circles have no owner, hence no owner attributes (RN-A D4).
    attributes: (circle.owner?.attributes ?? []).map((a) => ({ kind: a.kind, valueText: a.valueText, unit: a.unit })),
    accessRequests: await liveAccessRequests(tx, circle.id, circle.eventDate),
  };
}

async function liveAccessRequests(tx: Tx, circleId: string, eventDate: Date | null) {
  const rows = await tx.allowlistEntry.findMany({
    where: { circleId, status: 'pending', requesterName: { not: null } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, requesterName: true, createdAt: true },
  });
  // No event date yet: only the 72h window bounds a request's life.
  const expiryDate = eventDate ?? new Date(8640000000000000);
  return rows
    .filter((row) => row.requesterName !== null && isRequestLive(row.createdAt, expiryDate))
    .map((row) => ({ id: row.id, requesterName: row.requesterName!, requestedAt: row.createdAt.toISOString() }));
}

export async function friendCircleView(tx: Tx, circleId: string, viewerUserId: string, now: Date = new Date()): Promise<FriendCircleView | null> {
  const circle = await tx.circle.findUnique({
    where: { id: circleId },
    include: {
      items: {
        orderBy: { createdAt: 'asc' },
        include: {
          claims: true,
          pools: {
            include: {
              // `select`, not a bare include: users.phone_e164 / users.bsuid are
              // revoked from the app roles (001_roles.sql); a bare include raises.
              contributions: { include: { user: { select: { displayName: true } } } },
              payout: true,
            },
          },
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
      const pledgedMinor = pool === null
        ? 0
        : pool.contributions.reduce((sum, c) => sum + c.amountMinor, 0);
      const iAmBuyer = pool !== null && pool.buyerUserId === viewerUserId;
      // RLS already limited pool_payouts rows to what this role may read (buyer's
      // own row, or a shared row for a pledger); the checks below narrow further
      // so the render never depends on getting the policy exactly right.
      const payoutRow = pool?.payout ?? null;
      const myRow = pool?.contributions.find((c) => c.userId === viewerUserId) ?? null;
      const payoutVisible = payoutRow !== null
        && (iAmBuyer || (payoutRow.shareConsent && myRow !== null));
      return {
        id: item.id,
        title: item.title,
        retailer: item.retailer,
        price: item.priceMinor === null ? null : formatMinor(item.priceMinor, item.currency),
        currency: item.currency,
        hasPhoto: isStoredPhoto(item.imagePath),
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
                iAmBuyer,
                contributors: pool.contributions.length,
                pledged: formatMinor(pledgedMinor, pool.currency),
                pledgedMinor,
                myContribution: myRow === null ? null : {
                  amount: formatMinor(myRow.amountMinor, pool.currency),
                  amountMinor: myRow.amountMinor,
                  status: myRow.status,
                  reference: payoutReference(myRow.id, payoutRow?.referencePrefix ?? null),
                },
                payout: !payoutVisible || payoutRow === null ? null : {
                  accountHolder: payoutRow.accountHolder,
                  bankName: payoutRow.bankName,
                  accountNumber: payoutRow.accountNumber,
                  branchCode: payoutRow.branchCode,
                  accountType: payoutRow.accountType,
                  referencePrefix: payoutRow.referencePrefix,
                  shareConsent: payoutRow.shareConsent,
                },
                tally: !iAmBuyer ? [] : pool.contributions.map((c) => ({
                  userId: c.userId,
                  displayName: c.user.displayName,
                  amount: formatMinor(c.amountMinor, pool.currency),
                  amountMinor: c.amountMinor,
                  status: c.status,
                  reference: payoutReference(c.id, payoutRow?.referencePrefix ?? null),
                })),
              },
      };
    }),
    attributes: (circle.owner?.attributes ?? [])
      .filter((a) => a.visibility === 'friends')
      .map((a) => ({ kind: a.kind, valueText: a.valueText, unit: a.unit })),
  };
}
