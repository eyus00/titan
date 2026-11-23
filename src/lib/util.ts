import { useEffect } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Short random id (set and card ids, also used in URLs). */
export const uid = () => Math.random().toString(36).slice(2, 10);

/** A shuffled copy (Fisher-Yates). */
export function shuffle<T>(items: readonly T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Game clock: "8.4" under a minute, "1:08.4" after. Always tenths. */
export function formatTime(ms: number) {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  const s = Math.floor(tenths / 10);
  const t = tenths % 10;
  const m = Math.floor(s / 60);
  return m ? `${m}:${String(s % 60).padStart(2, '0')}.${t}` : `${s}.${t}`;
}

/** Same, with the unit, for running text: "8.4s", "1:08.4". */
export const formatDuration = (ms: number) => (ms < 60_000 ? `${formatTime(ms)}s` : formatTime(ms));

export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export function useTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · Titan` : 'Titan';
  }, [title]);
}

export const prefersReducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Save text as a file from the browser. */
export function download(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A file-system-safe name from a title. */
export const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'set';
