// Pre-React blocking script: runs before the app mounts to prevent a flash of
// the wrong theme. Reads the persisted config from localStorage and sets the
// `.dark` class (and, for derived/custom themes, the CSS variables) on <html>
// before first paint. Kept dependency-free and defensive — any error falls back
// to the dark default already declared in index.css.
(function () {
  try {
    var raw = localStorage.getItem('nostr:app-config');
    var cfg = raw ? JSON.parse(raw) : {};
    var theme = cfg && cfg.theme ? cfg.theme : 'dark';

    function systemDark() {
      return window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    var resolved = theme;
    if (theme === 'system') resolved = systemDark() ? 'dark' : 'light';

    var root = document.documentElement;

    // Builtin light/dark/system with no runtime `themes` override: index.css owns
    // the palette; we only need the `.dark` class right.
    if (resolved !== 'custom' && !cfg.themes) {
      root.classList.toggle('dark', resolved === 'dark');
      return;
    }

    // Derived theme (custom, or configured themes): we can't run the full color
    // deriver here, but we can at least set the background + `.dark` class so the
    // page doesn't flash. The React provider injects the complete token set on mount.
    var colors = null;
    if (resolved === 'custom' && cfg.customTheme && cfg.customTheme.colors) {
      colors = cfg.customTheme.colors;
    } else if (cfg.themes && cfg.themes[resolved] && cfg.themes[resolved].colors) {
      colors = cfg.themes[resolved].colors;
    }

    if (colors && colors.background) {
      var lParts = String(colors.background).trim().split(/\s+/);
      var l = parseFloat(lParts[2]);
      var dark = isFinite(l) ? l < 28 : true;
      root.classList.toggle('dark', dark);
      document.body && (document.body.style.background = 'hsl(' + colors.background + ')');
      root.style.setProperty('--background', 'hsl(' + colors.background + ')');
      if (colors.text) root.style.setProperty('--foreground', 'hsl(' + colors.text + ')');
    } else {
      root.classList.add('dark');
    }
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
