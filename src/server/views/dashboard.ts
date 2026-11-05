import type { Db } from '@/server/db/client';
import type { Session } from '@/server/auth/session';
import { formatMinor } from '@/lib/money';
import { isStoredPhoto } from '@/server/photos';

/**
 * The `/app` dashboard (docs/plans/shared-registry-and-circles.md Q3, Q7 and
 * flow-simplification: event-date sort + per-user Archived hide).
 */

export interface DashboardCircle {
  id: string;
  name: string;
  occasion: string;
  shareSlug: string;
  eventDate: string | null;
}

export interface DashboardRegistryLink {
  circleId: string;
  circleName: string;
  shareSlug: string;
  visible: boolean;
}

export interface DashboardRegistryItem {
  id: string;
  title: string;
  retailer: string | null;
  price: string | null;
  currency: string;
  hasPhoto: boolean;
  isPrivate: boolean;
  links: DashboardRegistryLink[];
}

export interface DashboardView {
  userId: string;
  displayName: string;
  role: 'owner' | 'friend';
  owned: DashboardCircle[];
  forOthers: DashboardCircle[];
  /** Friend memberships the person hid from the active list (collapsible). */
  archived: DashboardCircle[];
  registry: DashboardRegistryItem[] | null;
}

function byEventDate(a: DashboardCircle, b: DashboardCircle): number {
  if (a.eventDate === null && b.eventDate === null) return a.name.localeCompare(b.name);
  if (a.eventDate === null) return 1;
  if (b.eventDate === null) return -1;
  return a.eventDate < b.eventDate ? -1 : a.eventDate > b.eventDate ? 1 : a.name.localeCompare(b.name);
}

function mapCircle(row: { id: string; name: string; occasion: string; shareSlug: string; eventDate: Date | null }): DashboardCircle {
  return {
    id: row.id,
    name: row.name,
    occasion: row.occasion,
    shareSlug: row.shareSlug,
    eventDate: row.eventDate ? row.eventDate.toISOString().slice(0, 10) : null,
  };
}

async function circleGroups(db: Db, userId: string): Promise<{
  owned: DashboardCircle[];
  forOthers: DashboardCircle[];
  archived: DashboardCircle[];
}> {
  const select = { id: true, name: true, occasion: true, shareSlug: true, eventDate: true } as const;
  const [ownedRows, memberships, proxies] = await Promise.all([
    db.prisma.circle.findMany({
      where: { ownerUserId: userId, status: 'active' },
      select,
    }),
    db.prisma.membership.findMany({
      where: { userId, status: 'active', role: 'friend', circle: { status: 'active' } },
      select: {
        dashboardHidden: true,
        circle: { select },
      },
    }),
    db.prisma.circle.findMany({
      where: { proxyCreatedByUserId: userId, status: 'active' },
      select,
    }),
  ]);
  const owned = ownedRows.map(mapCircle).sort(byEventDate);
  const ownedIds = new Set(owned.map((circle) => circle.id));
  const seen = new Set<string>(ownedIds);
  const forOthers: DashboardCircle[] = [];
  const archived: DashboardCircle[] = [];
  for (const row of memberships) {
    if (ownedIds.has(row.circle.id) || seen.has(row.circle.id)) continue;
    seen.add(row.circle.id);
    const mapped = mapCircle(row.circle);
    if (row.dashboardHidden) archived.push(mapped);
    else forOthers.push(mapped);
  }
  for (const circle of proxies) {
    if (seen.has(circle.id)) continue;
    seen.add(circle.id);
    forOthers.push(mapCircle(circle));
  }
  forOthers.sort(byEventDate);
  archived.sort(byEventDate);
  return { owned, forOthers, archived };
}

/** Flat list for the circle side menu: active receive + for-others only (not archived). */
export async function loadAccessibleCircles(db: Db, userId: string): Promise<Array<DashboardCircle & { role: 'owner' | 'friend' }>> {
  const groups = await circleGroups(db, userId);
  return [
    ...groups.owned.map((circle) => ({ ...circle, role: 'owner' as const })),
    ...groups.forOthers.map((circle) => ({ ...circle, role: 'friend' as const })),
  ];
}

export async function loadDashboard(db: Db, session: Session | null): Promise<DashboardView | null> {
  if (!session) return null;
  const user = await db.prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, displayName: true },
  });
  if (!user) return null;
  const groups = await circleGroups(db, user.id);

  const registry =
    session.role !== 'owner'
      ? null
      : (
          await db.prisma.registryItem.findMany({
            where: { ownerUserId: user.id },
            orderBy: { createdAt: 'asc' },
            include: {
              links: {
                include: { circle: { select: { id: true, name: true, shareSlug: true } } },
                orderBy: { createdAt: 'asc' },
              },
            },
          })
        ).map((item) => ({
          id: item.id,
          title: item.title,
          retailer: item.retailer,
          price: item.priceMinor === null ? null : formatMinor(item.priceMinor, item.currency),
          currency: item.currency,
          hasPhoto: isStoredPhoto(item.imagePath),
          isPrivate: item.private,
          links: item.links.map((link) => ({
            circleId: link.circleId,
            circleName: link.circle.name,
            shareSlug: link.circle.shareSlug,
            visible: link.visible,
          })),
        }));

  return {
    userId: user.id,
    displayName: user.displayName,
    role: session.role,
    owned: groups.owned,
    forOthers: groups.forOthers,
    archived: groups.archived,
    registry,
  };
}

/** Login-role toggle for dashboard archive (hide from active list only). */
export async function setMembershipDashboardHidden(
  db: Db, userId: string, circleId: string, hidden: boolean,
): Promise<boolean> {
  const row = await db.prisma.membership.findFirst({
    where: { userId, circleId, status: 'active', role: 'friend' },
    select: { id: true },
  });
  if (!row) return false;
  await db.prisma.membership.update({
    where: { id: row.id },
    data: { dashboardHidden: hidden },
  });
  return true;
}
