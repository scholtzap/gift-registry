import type { CircleChoice } from '@/components/screens/circle-rail';

/** Circles for the signed-in person, plus which one is open. */
export type CircleSwitcher = {
  circles: CircleChoice[];
  currentSlug: string;
  appHref?: string;
};

export type CircleMenuProps = CircleSwitcher;

/**
 * Side-menu circle switcher: every circle this person can open, plus start-another
 * and the dashboard. Section links (Wishes / Add / Settings) live in Screen's sidebar.
 */
export function CircleMenu({
  circles,
  currentSlug,
  appHref = '/app',
}: CircleMenuProps) {
  return (
    <nav className="pn-sidemenu" aria-label="Circles">
      <p className="pn-eyebrow">Your circles</p>
      {circles.length === 0 ? (
        <p className="pn-small pn-muted">This is your only circle so far.</p>
      ) : (
        <ul className="pn-sidemenu-list">
          {circles.map((circle) => {
            const current = circle.shareSlug === currentSlug;
            const href = `/c/${encodeURIComponent(circle.shareSlug)}`;
            return (
              <li key={`${circle.role}-${circle.shareSlug}`}>
                {current ? (
                  <p className="pn-sidemenu-current" aria-current="page">
                    <strong>{circle.name}</strong>
                    <span className="pn-small pn-muted">Currently open</span>
                  </p>
                ) : (
                  <a className="pn-sidemenu-item" href={href}>{circle.name}</a>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <a className="pn-sidemenu-item" href={`${appHref}/new`}>Start another circle</a>
      <a className="pn-sidemenu-item" href={appHref}>All circles</a>
    </nav>
  );
}
