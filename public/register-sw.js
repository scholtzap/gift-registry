/*
 * Registers the app-shell worker. Plain script, not a module and not a bundle: both shells — the
 * raw `/c/<slug>` HTML and the Next layout — load this same file, and nothing about installing a
 * worker should depend on a build step.
 *
 * Loaded with `defer` so it never competes with the paint of a page someone opened from WhatsApp.
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = new URL(document.currentScript.src).pathname.replace(/register-sw\.js$/, '');
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base || '/' }).catch(() => {
      // Nothing to report. Registration is refused on an insecure origin and while the previous
      // document is still unloading; either way the app is fully usable over the network, and
      // every private surface is network-only whether or not this worker is installed.
    });
  });
}
