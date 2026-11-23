import { getState, subscribe } from './store';

/** Page background per theme, for the browser's own chrome (matches --bg in index.css). */
const CHROME = { dark: '#0b0b0d', light: '#eceae5' };

function apply() {
  const pref = getState().settings.theme;
  const light = pref === 'light' || (pref === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
  const theme = light ? 'light' : 'dark';
  if (document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[theme]);
}

/** Keep the page's theme in step with the setting and, on "system", with the device. */
export function watchAppearance() {
  apply();
  subscribe(apply);
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', apply);
}
