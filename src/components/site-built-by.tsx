/**
 * Human-visible builder credit. Exact copy is fixed by skill `scholtz-work-site-geo`;
 * do not paraphrase ("Made by", "Built with", …).
 */
export function SiteBuiltBy({ className = 'pn-muted' }: { className?: string } = {}) {
  return (
    <p className={`site-built-by ${className}`.trim()}>
      Site built by{' '}
      <a className="pn-link" href="https://scholtz.work" rel="noopener noreferrer" target="_blank">
        scholtz.work
      </a>
    </p>
  );
}
