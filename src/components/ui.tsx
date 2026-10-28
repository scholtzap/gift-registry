import type { CSSProperties, HTMLInputTypeAttribute, MouseEventHandler, ReactNode } from 'react';
import { currencySymbol } from '@/lib/money';

export type NavItem = { href: string; label: string; icon?: 'ledger' | 'add' | 'settings' | 'card'; current?: boolean };

/** What the shell header shows so a person knows which circle they are in and which side of it. */
export type CircleContext = { name: string; role: 'owner' | 'friend' };

// Presentation only: both projections may use these primitives with already-authorised content.
export function Brand({ href = '/' }: { href?: string } = {}) {
  return (
    <a className="pn-brand" href={href} aria-label="Piñata home">
      <img src="/icon.png" alt="" width={40} height={40} />
      <span className="pn-wordmark">Piñata</span>
    </a>
  );
}

const TAB_ICONS: Record<string, ReactNode> = {
  ledger: <path d="M4 6.5h16M4 12h16M4 17.5h10" />,
  add: <path d="M12 5v14M5 12h14" />,
  settings: <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M8 14v6" />,
  card: <path d="M4 6.5h16v11H4zM4 10h16" />,
};

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25}
         strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </svg>
  );
}

function TabIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
         strokeLinecap="round" aria-hidden="true" focusable="false">
      {TAB_ICONS[name] ?? TAB_ICONS.ledger}
    </svg>
  );
}

/**
 * The app shell. `circle` and `nav` are optional so the public landing page renders a bare
 * header; every circle screen passes both, which is what turns a stack of panels into an app
 * with a sense of where you are. The tab bar and the header nav are the same `nav` array
 * rendered twice — CSS shows exactly one of them per breakpoint.
 */
export function Screen({
  children,
  title,
  eyebrow,
  lede,
  backHref,
  backLabel = 'Back',
  circle,
  nav,
  footer,
  homeHref,
  privacyHref,
}: {
  children: ReactNode;
  title?: ReactNode;
  eyebrow?: ReactNode;
  lede?: ReactNode;
  backHref?: string;
  backLabel?: ReactNode;
  circle?: CircleContext;
  nav?: NavItem[];
  footer?: ReactNode;
  /** Where the brand link goes. Defaults to the user's circle (first nav item) when signed in. */
  homeHref?: string;
  /** The app's own privacy route. Defaults to it under the deployment base path (CR-UX-05). */
  privacyHref?: string;
}) {
  const resolvedHomeHref = homeHref ?? (circle && nav && nav.length > 0 ? nav[0]!.href : '/');
  const resolvedPrivacyHref = privacyHref ?? `${process.env.PINATA_BASE_PATH ?? ''}/privacy`;
  return (
    <div className="pn-screen">
      <a className="pn-skip" href="#pn-content">Skip to content</a>
      <header className="pn-header">
        <div className="pn-bar">
          <Brand href={resolvedHomeHref} />
          {circle && (
            <div className="pn-context">
              <p className={`pn-sticker${circle.role === 'owner' ? ' pn-sticker-owner' : ''}`}>
                {circle.role === 'friend' && <LockIcon />}
                {circle.role === 'owner' ? 'Owner view' : 'Friends only'}
              </p>
              <p className="pn-context-name">{circle.name}</p>
            </div>
          )}
          {nav && nav.length > 0 && (
            <nav className="pn-nav" aria-label="Circle sections">
              <ul className="pn-nav-list">
                {nav.map((item) => (
                  <li key={item.href}>
                    <a className="pn-nav-item" href={item.href} {...(item.current ? { 'aria-current': 'page' as const } : {})}>
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </header>
      <main className="pn-main pn-stack" id="pn-content" tabIndex={-1}>
        {backHref && <a className="pn-back pn-link" href={backHref}><span aria-hidden="true">← </span>{backLabel}</a>}
        {(title != null || eyebrow != null || lede != null) && (
          <div className="pn-heading">
            {eyebrow != null && <p className="pn-eyebrow">{eyebrow}</p>}
            {title != null && <h1>{title}</h1>}
            {lede != null && <p className="pn-subhead">{lede}</p>}
          </div>
        )}
        {children}
      </main>
      {nav && nav.length > 0 && (
        <nav className="pn-tabbar" aria-label="Circle sections">
          {nav.map((item) => (
            <a key={item.href} className="pn-tab" href={item.href} {...(item.current ? { 'aria-current': 'page' as const } : {})}>
              <TabIcon name={item.icon ?? 'ledger'} />
              {item.label}
            </a>
          ))}
        </nav>
      )}
      <footer className="pn-footer pn-between">
        <p>{footer ?? 'Group gifts nobody can spoil.'}</p>
        <a className="pn-link pn-link-target" href={resolvedPrivacyHref}>Privacy notice</a>
      </footer>
    </div>
  );
}

export function Panel({ children, className = '', tone, as }: {
  children: ReactNode;
  className?: string;
  tone?: 'plain' | 'human' | 'money' | 'done';
  as?: 'div' | 'aside' | 'section';
}) {
  const parts = ['pn-panel', tone && tone !== 'plain' ? `pn-tone-${tone}` : '', className];
  const Element = as ?? 'div';
  return <Element className={parts.filter(Boolean).join(' ')}>{children}</Element>;
}

export function Button({
  children,
  type = 'button',
  disabled,
  onClick,
  variant = 'primary',
  className = '',
  block,
}: {
  children: ReactNode;
  type?: 'button' | 'submit';
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLElement>;
  variant?: 'primary' | 'secondary' | 'quiet';
  className?: string;
  block?: boolean;
}) {
  return (
    <button
      className={`pn-button pn-button-${variant} ${block ? 'pn-button-block' : ''} ${className}`.trim()}
      type={type} disabled={disabled} onClick={onClick}
    >
      {children}
    </button>
  );
}

/** A link that behaves like a control, for the row action that is not a form submit.
 *  `size="title"` is the list-row heading link: display scale, still a 44px target. */
export function Cta({ children, href, variant = 'secondary', size, className = '' }: {
  children: ReactNode;
  href: string;
  variant?: 'primary' | 'secondary';
  size?: 'title';
  className?: string;
}) {
  const parts = [size === 'title' ? 'pn-cta-title' : 'pn-cta', variant === 'primary' && size !== 'title' ? 'pn-cta-primary' : '', className];
  return (
    <a className={parts.filter(Boolean).join(' ')} href={href}>
      <span>{children}</span>
    </a>
  );
}

export function Field({
  label,
  name,
  id,
  type = 'text',
  defaultValue,
  required,
  maxLength,
  placeholder,
  hint,
  min,
  step,
  autoComplete,
  inputMode,
  multiline,
}: {
  label: ReactNode;
  name: string;
  id: string;
  type?: HTMLInputTypeAttribute;
  defaultValue?: string | number;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  hint?: ReactNode;
  min?: string | number;
  step?: string | number;
  autoComplete?: string;
  inputMode?: 'text' | 'tel' | 'numeric' | 'decimal' | 'email' | 'url' | 'search' | 'none';
  multiline?: boolean;
}) {
  const hintId = hint != null ? `${id}-hint` : undefined;
  const control = multiline
    ? <textarea className="pn-input" id={id} name={name} defaultValue={defaultValue} required={required} maxLength={maxLength} placeholder={placeholder} aria-describedby={hintId} />
    : <input className="pn-input" id={id} name={name} type={type} defaultValue={defaultValue} required={required} maxLength={maxLength} placeholder={placeholder} min={min} step={step} autoComplete={autoComplete} inputMode={inputMode} aria-describedby={hintId} />;
  return (
    <div className="pn-field">
      <label htmlFor={id}>{label}{required && <span className="pn-small pn-muted"> (required)</span>}</label>
      {control}
      {hint != null && <p className="pn-hint pn-small pn-muted" id={hintId}>{hint}</p>}
    </div>
  );
}

/**
 * An amount in the item's currency, typed the way people say it ("400", "1,250", "99.50"). The
 * symbol sits inside the field; the server turns the text into integer cents with
 * `parseAmountToMinor`. Nobody types cents.
 */
export function AmountField({ label, name, id, currency, defaultValue, required, hint }: {
  label: ReactNode;
  name: string;
  id: string;
  currency: string;
  defaultValue?: string;
  required?: boolean;
  hint?: ReactNode;
}) {
  const hintId = hint != null ? `${id}-hint` : undefined;
  return (
    <div className="pn-field">
      <label htmlFor={id}>{label}{required && <span className="pn-small pn-muted"> (required)</span>}</label>
      <div className="pn-amount" data-symbol={currencySymbol(currency)}>
        <input className="pn-input" id={id} name={name} type="text" inputMode="decimal" autoComplete="off"
               defaultValue={defaultValue} required={required} maxLength={14} aria-describedby={hintId} />
      </div>
      {hint != null && <p className="pn-hint pn-small pn-muted" id={hintId}>{hint}</p>}
    </div>
  );
}

/** Badge tones are meanings, not colours: a person or a secret, money, settled, still open, needs attention. */
export type BadgeTone = 'human' | 'money' | 'done' | 'open' | 'alert' | 'neutral';

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span className={`pn-badge pn-badge-${tone}`}>
      {tone === 'done' && <span aria-hidden="true">✓ </span>}
      {tone === 'alert' && <span aria-hidden="true">! </span>}
      {children}
    </span>
  );
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A calendar date ("2026-11-15") as people say it: "Sun 15 Nov 2026". Read in UTC, so the
 *  server and every phone print the same day. Unbreakable, like an amount. */
export function EventDate({ iso }: { iso: string }) {
  const date = new Date(`${iso}T00:00:00Z`);
  const label = Number.isNaN(date.getTime())
    ? iso
    : `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  return <time className="pn-money" dateTime={iso}>{label}</time>;
}

/**
 * A gift's product photo, served by the circle route after it checks the viewer's projection.
 * Decorative next to the title (empty alt); `large` is the item page's hero image.
 */
export function ItemPhoto({ basePath, itemId, large }: { basePath: string; itemId: string; large?: boolean }) {
  const size = large ? 480 : 64;
  return (
    <img className={`pn-photo ${large ? 'pn-photo-lg' : 'pn-photo-sm'}`} src={`${basePath}/items/${encodeURIComponent(itemId)}/photo`}
         alt="" width={size} height={size} loading="lazy" decoding="async" />
  );
}

/** Add/replace a product photo. Rendered only where the projection allows editing. */
export function PhotoUploadForm({ basePath, itemId, hasPhoto }: { basePath: string; itemId: string; hasPhoto: boolean }) {
  return (
    <form action={`${basePath}/items/${encodeURIComponent(itemId)}/photo`} method="post" encType="multipart/form-data" className="pn-stack pn-stack-sm">
      <input type="hidden" name="intent" value="set_photo" />
      <div className="pn-field">
        <label htmlFor={`photo-${itemId}`}>{hasPhoto ? 'Replace photo' : 'Add a photo'}</label>
        <input className="pn-input" id={`photo-${itemId}`} name="photo" type="file" accept="image/jpeg,image/png,image/webp" required />
        <p className="pn-hint pn-small pn-muted">Product photo only, not people. JPEG, PNG or WebP, up to 5 MB; location and camera details are removed.</p>
      </div>
      <div className="pn-actions"><Button type="submit" variant="secondary">{hasPhoto ? 'Replace photo' : 'Add photo'}</Button></div>
    </form>
  );
}

/** One amount as an unbreakable token, for amounts that sit inside a sentence. */
export function Money({ children }: { children: ReactNode }) {
  return <span className="pn-money">{children}</span>;
}

/** Settled against target, as a piñata-stripe fill. Amounts stay the source of truth; the
 *  bar is `role="img"` with the numbers in its label, so no screen-reader reads a width.
 *  The two amounts are pre-formatted with their currency symbol, so no code is repeated here.
 *  Callers show the numbers themselves beside this (see `StatList`); the bar adds proportion only. */
export function Meter({ settled, target, percent, done }: {
  settled: string;
  target: string;
  percent: number;
  done?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const state = done ? ' pn-meter-done' : clamped >= 100 ? ' pn-meter-full' : '';
  return (
    <div className={`pn-meter${state}`}>
      <div className="pn-meter-head">
        <p className="pn-eyebrow">In the piñata</p>
        <p className="pn-meter-pct">{clamped}%</p>
      </div>
      <div className="pn-meter-track" role="img" aria-label={`${settled} settled of ${target} target`}>
        <span className="pn-meter-fill" style={{ '--pn-fill': `${clamped}%` } as CSSProperties} />
      </div>
    </div>
  );
}

export function Stat({ label, value, tone }: {
  label: ReactNode;
  value: ReactNode;
  tone?: 'money' | 'done';
}) {
  return (
    <div className={`pn-stat${tone ? ` pn-stat-${tone}` : ''}`}>
      <dt className="pn-eyebrow">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function StatList({ children }: { children: ReactNode }) {
  return <dl className="pn-stats">{children}</dl>;
}

const attributeLabels: Record<string, string> = {
  ring_size: 'Ring size',
  shoe_size: 'Shoe size',
  top: 'Top size',
  bottom: 'Bottom size',
  colour: 'Colour',
  other: 'Other preference',
};

/**
 * Sizes and preferences, one label-and-value row each. Both projections render the same
 * attribute list through this one component so a friend and the owner never see the same
 * `kind` under two different names, and a long free-text value wraps as prose instead of
 * being squeezed into a stat tile.
 */
export function AttributeList({ items }: {
  items: { kind: string; valueText: string; unit: string | null }[];
}) {
  return (
    <dl className="pn-stack pn-stack-sm">
      {items.map((attribute, index) => (
        <div key={`${attribute.kind}-${index}`}>
          <dt className="pn-eyebrow">
            {attributeLabels[attribute.kind]
              ?? attribute.kind.replaceAll('_', ' ').replace(/^./, char => char.toUpperCase())}
          </dt>
          <dd>{attribute.valueText}{attribute.unit !== null && <> {attribute.unit}</>}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The party date and its countdown on one line, identical markup on both projections. `date` is
 * the ISO value the `<time>` element carries; `label` and `countdown` are what a person reads.
 * All three come from the projection, because that is where a role's right to see them is
 * decided — this component never derives anything, and it renders nothing when the projection
 * withheld the date, so a screen has no branch left to get wrong.
 */
export function DateLine({ date, label, countdown }: {
  date: string | null;
  label: string | null;
  countdown: string | null;
}) {
  if (date === null || label === null || countdown === null) return null;
  return (
    <p className="pn-small">
      <time dateTime={date}>{label}</time> · {countdown}
    </p>
  );
}

/**
 * The one native form that writes the event date, used by both projections — last writer wins,
 * and the writer is whoever the session says it is, not a field in this form. No JavaScript:
 * `/c/<slug>` is the URL pasted into a WhatsApp group and it stays framework-free.
 *
 * `defaultValue` is the value the caller is allowed to see (the projection decided that already)
 * or the rejected draft, so a 422 re-render never empties the field the person just filled in.
 */
export function EventDateForm({ basePath, defaultValue, notice }: {
  basePath: string;
  defaultValue: string | null;
  notice?: string;
}) {
  // Pre-filled from the projection, so saving an unchanged date is never demanded:
  // the field is only required when no date is set yet (CR-UX-05).
  const hasDate = defaultValue !== null && defaultValue !== '';
  return (
    <form method="post" action={`${basePath}/date`} className="pn-stack pn-stack-sm">
      <input type="hidden" name="intent" value="set_event_date" />
      {notice !== undefined && <Notice kind="error">{notice}</Notice>}
      <Field
        label="Party date"
        name="eventDate"
        id="event-date"
        type="date"
        defaultValue={defaultValue ?? undefined}
        required={!hasDate}
        hint="The day the gift is handed over. Whoever sets it last decides whether it stays secret."
      />
      <div className="pn-actions">
        <Button type="submit" variant="primary">Save the date</Button>
      </div>
    </form>
  );
}

/** Status copy with a severity. `alert` for a rejection, `status` for something that just happened. */
export function Notice({ children, kind = 'info', title }: {
  children: ReactNode;
  kind?: 'info' | 'warning' | 'money' | 'done' | 'error' | 'success';
  title?: ReactNode;
}) {
  const role = kind === 'error' ? 'alert' : kind === 'success' ? 'status' : undefined;
  const tone = kind === 'money' ? ' pn-banner-money'
    : kind === 'done' || kind === 'success' ? ' pn-banner-done'
      : kind === 'warning' ? ' pn-banner-warning' : '';
  return (
    <section className={`pn-banner${tone}`} {...(role ? { role } : {})}>
      {title != null && <h2 className="pn-item-title">{title}</h2>}
      {children}
    </section>
  );
}

export function EmptyState({ title, children, action }: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="pn-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true" focusable="false">
        <path d="M3 8.5h18V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 8.5 5 4h14l2 4.5M12 4v17" />
      </svg>
      <h3>{title}</h3>
      {children != null && <p className="pn-muted">{children}</p>}
      {action != null && <div className="pn-actions">{action}</div>}
    </div>
  );
}
