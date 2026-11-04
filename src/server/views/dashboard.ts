import type { Db } from '@/server/db/client';
import type { Session } from '@/server/auth/session';
import { formatMinor } from '@/lib/money';
import { isStoredPhoto } from '@/server/photos';

/**
 * The `/app` dashboard (docs/plans/shared-registry-and-circles.md Q3, Q7 and
 * ledger row 11: the owner return path). One entry door, two shapes:
 *
 * - **Gifts for you:** active circles this person owns.
 * - **Gifts for others:** active friend memberships, plus proxy circles they
 *   created (even without a membership row).
 * - The registry half renders only for an owner session. A friend session
 *   never sees it.
 *
 * Read on the login role from a signed session: the user id comes from the
 * cookie's MAC, and every row returned belongs to that user (owned circles,
 * active memberships, own registry). Nothing here renders claim, pool or
 * contribution state, so the surprise rule holds by construction.
 */

export interface DashboardCircle {
  id: string;
  name: string;
  occasion: string;
  shareSlug: string;
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
  /** Active circles this person receives in (they are the owner). */
  owned: DashboardCircle[];
  /** Active friend memberships plus proxy circles this person created. */
  forOthers: DashboardCircle[];
  /** Null unless the session is the owner path: friends never get a registry. */
  registry: DashboardRegistryItem[] | null;
}

async function circleGroups(db: Db, userId: string): Promise<{ owned: DashboardCircle[]; forOthers: DashboardCircle[] }> {
  const [owned, memberships, proxies] = await Promise.all([
    db.prisma.circle.findMany({
      where: { ownerUserId: userId, status: 'active' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, occasion: true, shareSlug: true },
    }),
    db.prisma.membership.findMany({
      where: { userId, status: 'active', role: 'friend', circle: { status: 'active' } },
      orderBy: { joinedAt: 'asc' },
      select: { circle: { select: { id: true, name: true, occasion: true, shareSlug: true, ownerUserId: true } } },
    }),
    db.prisma.circle.findMany({
      where: { proxyCreatedByUserId: userId, status: 'active' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, occasion: true, shareSlug: true },
    }),
  ]);
  const ownedIds = new Set(owned.map((circle) => circle.id));
  const seen = new Set<string>(ownedIds);
  const forOthers: DashboardCircle[] = [];
  for (const row of memberships) {
    if (ownedIds.has(row.circle.id) || seen.has(row.circle.id)) continue;
    seen.add(row.circle.id);
    forOthers.push({
      id: row.circle.id,
      name: row.circle.name,
      occasion: row.circle.occasion,
      shareSlug: row.circle.shareSlug,
    });
  }
  for (const circle of proxies) {
    if (seen.has(circle.id)) continue;
    seen.add(circle.id);
    forOthers.push(circle);
  }
  return { owned, forOthers };
}

/** Flat list for the circle side menu: receive-circles, then circles for other people. */
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
    registry,
  };
}
