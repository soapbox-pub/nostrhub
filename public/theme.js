// Pre-React blocking script: runs before the app mounts to prevent a flash of
// the wrong theme. Reads the persisted theme mode from localStorage and sets the
// `.dark` class on <html> before first paint. Dependency-free and defensive —
// any error falls back to the dark default declared in index.css.
//
// Note: the "ditto" theme can't be resolved here (it needs a Nostr fetch), so we
// fall back to the OS preference until <DittoThemeInjector/> applies it.
(function () {
  try {
    var raw = localStorage.getItem('nostr:app-config');
    var cfg = raw ? JSON.parse(raw) : {};
    var theme = cfg && cfg.theme ? cfg.theme : 'dark';

    function systemDark() {
      return window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    var dark;
    if (theme === 'dark') dark = true;
    else if (theme === 'light') dark = false;
    else dark = systemDark(); // "system" or "ditto"

    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
