/**
 * RN-E: a once-off (proxy) circle archives itself after its day.
 *
 * State is derived on read, never stored and never advanced by a scheduler:
 * a job that does not run during the demo recording would be a visible
 * failure, and a stored flag nobody writes is a lie. The stored status
 * remains the cache it always was; this derivation is the truth, in one
 * place shared by every route that asks.
 *
 * Numbers (rn-e Decision, 2026-10-27): archive 72 hours after the event
 * date — or at the end of the event day when the day was moved earlier than
 * createdAt + 72h, never before the day itself — and purge the hashed
 * lookup material 90 days after archiving. Only proxy circles (no owner)
 * archive; an owner-run circle stays under its owner's control.
 */

export const ARCHIVE_GRACE_MS = 72 * 60 * 60 * 1000;
export const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export type DerivedCircleStatus = "active" | "closed" | "archived" | "purged";

export interface LifecycleCircle {
  status: string;
  createdAt: Date;
  eventDate: Date;
  ownerUserId: string | null;
}

function endOfDay(date: Date): number {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end.getTime();
}

export function archiveAt(circle: LifecycleCircle): number | null {
  if (circle.ownerUserId !== null) return null;
  const eventMs = circle.eventDate.getTime();
  if (eventMs < circle.createdAt.getTime() + ARCHIVE_GRACE_MS) return endOfDay(circle.eventDate);
  return eventMs + ARCHIVE_GRACE_MS;
}

export function derivedCircleStatus(circle: LifecycleCircle, now = new Date()): DerivedCircleStatus {
  if (circle.status === "closed") return "closed";
  const at = archiveAt(circle);
  if (at === null) return "active";
  const nowMs = now.getTime();
  if (nowMs >= at + RETENTION_MS) return "purged";
  if (nowMs >= at) return "archived";
  return "active";
}

export function isArchived(circle: LifecycleCircle, now = new Date()): boolean {
  const derived = derivedCircleStatus(circle, now);
  return derived === "archived" || derived === "purged";
}

/**
 * RN-J: a permission request dies at the earlier of 72h after it was made
 * and the end of the event day, derived from stored dates (sharewear's
 * earlier-of rule), never written by a job. The owner's inbox shows what is
 * derivable, not what was stamped.
 */
export const REQUEST_WINDOW_MS = 72 * 60 * 60 * 1000;

export function requestExpiresAt(requestedAt: Date, eventDate: Date): number {
  return Math.min(requestedAt.getTime() + REQUEST_WINDOW_MS, endOfDay(eventDate));
}

export function isRequestLive(requestedAt: Date, eventDate: Date, now = new Date()): boolean {
  return now.getTime() < requestExpiresAt(requestedAt, eventDate);
}
