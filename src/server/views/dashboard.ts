import type { Db } from '@/server/db/client';
import type { Session } from '@/server/auth/session';
import { formatMinor } from '@/lib/money';
import { isStoredPhoto } from '@/server/photos';

/**
 * The `/app` dashboard (docs/plans/shared-registry-and-circles.md Q3, Q7 and
 * ledger row 11: the owner return path). One entry door, two shapes:
 *
 * - An **owner** session sees owned + member circles and their own canonical
 *   registry. The registry is theirs to manage; friends never get this half.
 * - A **friend** session sees member circles only — no registry view, because
 *   friends gain nothing from one and might misread claim scope.
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
  owned: DashboardCircle[];
  member: DashboardCircle[];
  /** Null for friend sessions: no registry view (Q3). */
  registry: DashboardRegistryItem[] | null;
}

export async function loadDashboard(db: Db, session: Session | null): Promise<DashboardView | null> {
  if (!session) return null;
  const user = await db.prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      displayName: true,
      ownedCircles: {
        where: { status: 'active' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, occasion: true, shareSlug: true },
      },
      memberships: {
        where: { status: 'active', role: 'friend', circle: { status: 'active' } },
        orderBy: { joinedAt: 'asc' },
        select: { circle: { select: { id: true, name: true, occasion: true, shareSlug: true } } },
      },
    },
  });
  if (!user) return null;

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
    owned: user.ownedCircles,
    member: user.memberships.map((m) => m.circle),
    registry,
  };
}
