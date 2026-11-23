/**
 * Picks the font size for a match card: the largest size at which the whole text fits the
 * card, so a one-word term reads big and a paragraph-long definition still shows in full.
 * Measured with a hidden element that uses the same `.card-text` rules as the real cards.
 */

let probe: HTMLDivElement | null = null;
const cache = new Map<string, Fit>();

export interface Fit {
  size: number;
  /** False when the text is too long even at the smallest size: the card then grows instead. */
  fits: boolean;
}

function getProbe() {
  if (probe?.isConnected) return probe;
  probe = document.createElement('div');
  probe.className = 'card-text';
  probe.setAttribute('aria-hidden', 'true');
  Object.assign(probe.style, {
    position: 'fixed',
    left: '-9999px',
    top: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
    // Long words overflow here instead of breaking, so the size shrinks before a word is split.
    overflowWrap: 'normal',
  });
  document.body.appendChild(probe);
  return probe;
}

const heights = new Map<string, number>();

/** How tall `text` is when set at `size` px in a column `width` px wide. */
export function textHeight(text: string, width: number, size: number): number {
  const w = Math.floor(width);
  const key = `${w}|${size}|${text}`;
  const hit = heights.get(key);
  if (hit !== undefined) return hit;
  const el = getProbe();
  el.style.width = `${w}px`;
  el.style.fontSize = `${size}px`;
  el.textContent = text;
  const h = el.scrollHeight;
  if (heights.size > 4000) heights.clear();
  heights.set(key, h);
  return h;
}

/** Largest font size (px, in half steps between min and max) at which `text` fits a width x height box. */
export function fitText(text: string, width: number, height: number, min: number, max: number): Fit {
  const w = Math.floor(width);
  const h = Math.floor(height);
  const key = `${w}|${h}|${min}|${max}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const el = getProbe();
  el.style.width = `${w}px`;
  el.textContent = text;
  const ok = (size: number) => {
    el.style.fontSize = `${size}px`;
    return el.scrollHeight <= h && el.scrollWidth <= w + 1;
  };

  let result: Fit;
  if (ok(max)) result = { size: max, fits: true };
  else if (!ok(min)) result = { size: min, fits: false };
  else {
    // Binary search over half-pixel steps: lo always fits, hi never does.
    let lo = Math.round(min * 2);
    let hi = Math.round(max * 2);
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ok(mid / 2)) lo = mid;
      else hi = mid;
    }
    result = { size: lo / 2, fits: true };
  }

  if (cache.size > 2000) cache.clear();
  cache.set(key, result);
  return result;
}
