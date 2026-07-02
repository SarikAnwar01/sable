import { SEARCH_ENGINES, type SearchEngineId } from '@shared';

/**
 * The Sable new-tab page. Served locally via the `sable://newtab` protocol so
 * opening a tab is instant and never pulls in a third-party homepage.
 *
 * Brutalist-minimal, inherited from sarikanwar.com.np: ✳ mark, teal accent,
 * mono numeric indices, hairline dividers. Colours follow prefers-color-scheme,
 * which the app's theme toggle drives via Electron's nativeTheme — so this page
 * flips light/dark in lockstep with the chrome. The search box submits to the
 * configured engine; a URL-ish query navigates directly instead of searching.
 */
export function newtabHtml(searchEngine: SearchEngineId): string {
  const engine = SEARCH_ENGINES[searchEngine];
  return /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>New Tab</title>
<style>
  :root {
    color-scheme: dark light;
    --bg-a: #14181a; --bg-b: #0b0b0f; --panel: #111517;
    --accent: #00d17a; --accent-soft: rgba(0,209,122,0.15);
    --fg: #e8e8ea; --dim: #71717a; --faint: #3f3f46; --line: #1c1c22;
    --mono: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --bg-a: #ffffff; --bg-b: #faf9f6; --panel: #ffffff;
      --accent: #00a862; --accent-soft: rgba(0,168,98,0.15);
      --fg: #16150f; --dim: #6b6a63; --faint: #b3b1a8; --line: #e6e4dc;
    }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    background: radial-gradient(1200px 600px at 50% -10%, var(--bg-a) 0%, var(--bg-b) 60%);
    color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    display: flex; align-items: center; justify-content: center;
  }
  .wrap { width: min(440px, 86vw); margin-top: -6vh; text-align: center; }
  .star { color: var(--accent); font-size: 15px; letter-spacing: 0.3em; margin-bottom: 12px; }
  .mark {
    font-size: 52px; font-weight: 600; letter-spacing: 0.14em;
    text-transform: uppercase; margin: 0 0 6px; color: var(--fg);
  }
  .mark .dot { color: var(--accent); }
  .tag { color: var(--dim); font-size: 13px; margin: 0 0 30px; letter-spacing: 0.02em; }
  form { position: relative; }
  input {
    width: 100%; padding: 15px 18px; font-size: 15px;
    color: var(--fg); background: var(--panel);
    border: 1px solid var(--line); border-radius: 12px; outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  input::placeholder { color: var(--faint); }
  input:focus { border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
  .links {
    display: flex; justify-content: center; gap: 22px;
    margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--line);
  }
  .links a { color: var(--dim); font-size: 12px; text-decoration: none; transition: color .12s; }
  .links a:hover { color: var(--fg); }
  .links .idx { font-family: var(--mono); color: var(--accent); margin-right: 5px; }
  .hint { margin-top: 16px; color: var(--faint); font-size: 11px; }
  .hint kbd {
    font-family: var(--mono); background: var(--panel); border: 1px solid var(--line);
    border-radius: 5px; padding: 1px 6px; color: var(--dim); font-size: 11px;
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="star">&#10033;</div>
    <h1 class="mark">Sable<span class="dot">.</span></h1>
    <p class="tag">Fast. Minimal. Private.</p>
    <form id="f" autocomplete="off">
      <input id="q" name="q" placeholder="Search ${engine.name} or type a URL" autofocus spellcheck="false" />
    </form>
    <nav class="links">
      <a href="https://mail.google.com"><span class="idx">01</span>Gmail</a>
      <a href="https://github.com"><span class="idx">02</span>GitHub</a>
      <a href="https://www.youtube.com"><span class="idx">03</span>YouTube</a>
    </nav>
    <p class="hint">Press <kbd>Enter</kbd> to search &nbsp;·&nbsp; ads &amp; trackers blocked automatically</p>
  </div>
  <script>
    const form = document.getElementById('f');
    const q = document.getElementById('q');
    function resolve(text) {
      text = text.trim();
      if (!text) return null;
      if (/^https?:\\/\\//i.test(text)) return text;
      if (/^localhost(:\\d+)?(\\/.*)?$/i.test(text)) return 'http://' + text;
      const domain = !/\\s/.test(text) && /^[^\\s]+\\.[^\\s.]{2,}$/.test(text);
      if (domain) return 'https://' + text;
      return ${JSON.stringify(engine.query)}.replace('%s', encodeURIComponent(text));
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = resolve(q.value);
      if (url) window.location.href = url;
    });
  </script>
</body>
</html>`;
}
