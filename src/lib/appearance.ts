import { getState, subscribe } from './store';

/** Page background per theme, for the browser's own chrome (matches --bg in index.css). */
const CHROME = { dark: '#0b0b0d', light: '#eceae5' };

function apply() {
  const pref = getState().settings.theme;
  const light = pref === 'light' || (pref === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
  const theme = light ? 'light' : 'dark';
  if (document.documentElement.dataset.theme === theme) return;

  // Every colour changes at once, so transitions are switched off for the swap: otherwise each
  // element fades at its own pace and the change smears. They come back after the next paint.
  const still = document.createElement('style');
  still.textContent = '*,*::before,*::after{transition:none !important}';
  document.head.append(still);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[theme]);
  void document.body.offsetHeight;
  requestAnimationFrame(() => requestAnimationFrame(() => still.remove()));
}

/** Keep the page's theme in step with the setting and, on "system", with the device. */
export function watchAppearance() {
  apply();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[document.documentElement.dataset.theme === 'light' ? 'light' : 'dark']);
  subscribe(apply);
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', apply);
}
