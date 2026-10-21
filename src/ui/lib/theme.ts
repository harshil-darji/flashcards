import lightCss from 'highlight.js/styles/github.css?inline';
import darkCss from 'highlight.js/styles/github-dark.css?inline';
import type { ThemePreference } from '../../types';

const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let current: ThemePreference = 'system';

function resolved(): 'light' | 'dark' {
  if (current === 'system') return mq?.matches ? 'dark' : 'light';
  return current;
}

function styleEl(): HTMLStyleElement {
  let el = document.getElementById('hljs-theme') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'hljs-theme';
    document.head.appendChild(el);
  }
  return el;
}

function apply() {
  const root = document.documentElement;
  if (current === 'system') delete root.dataset.theme;
  else root.dataset.theme = current;
  const mode = resolved();
  // Scope hljs backgrounds to our code-block styling.
  styleEl().textContent = mode === 'dark' ? darkCss : lightCss;
  const color = mode === 'dark' ? '#000000' : '#f2f2f7';
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color));
}

mq?.addEventListener('change', () => current === 'system' && apply());

export function applyTheme(pref: ThemePreference) {
  current = pref;
  apply();
}
