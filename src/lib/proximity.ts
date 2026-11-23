import { useEffect, useRef } from 'react';

/**
 * Makes a group of cards react to the pointer together. Every `.near` element inside the
 * returned ref gets a `--near` value from 0 to 1 for how close the pointer is: 1 under it,
 * fading with distance, so neighbours light up a little as the pointer approaches. Values
 * rise quickly and fall slowly (`--near-ms`), which leaves a soft trail behind the pointer.
 * The look itself is CSS (`.near::after` in index.css). Keyboard focus counts as a pointer.
 */
export function useProximity<T extends HTMLElement>(radius = 240) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let frame = 0;
    let point: { x: number; y: number } | null = null;
    const levels = new WeakMap<HTMLElement, number>();

    const apply = () => {
      frame = 0;
      for (const el of root.querySelectorAll<HTMLElement>('.near')) {
        let level = 0;
        if (point) {
          const r = el.getBoundingClientRect();
          const dx = Math.max(r.left - point.x, 0, point.x - r.right);
          const dy = Math.max(r.top - point.y, 0, point.y - r.bottom);
          const d = Math.hypot(dx, dy);
          level = d >= radius ? 0 : (1 - d / radius) ** 1.6;
        }
        const before = levels.get(el) ?? 0;
        if (Math.abs(level - before) < 0.01) continue;
        levels.set(el, level);
        el.style.setProperty('--near-ms', level > before ? '140ms' : '900ms');
        el.style.setProperty('--near', level.toFixed(3));
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      point = { x: e.clientX, y: e.clientY };
      schedule();
    };
    const onLeave = () => {
      point = null;
      schedule();
    };
    const onFocus = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLElement) || !t.matches(':focus-visible')) return;
      const r = t.getBoundingClientRect();
      point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      schedule();
    };

    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerleave', onLeave);
    root.addEventListener('focusin', onFocus);
    root.addEventListener('focusout', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('focusin', onFocus);
      root.removeEventListener('focusout', onLeave);
    };
  }, [radius]);

  return ref;
}
