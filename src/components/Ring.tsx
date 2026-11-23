import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { animate, useReducedMotion } from 'motion/react';
import type { Stage } from '../lib/learn';
import { cx } from '../lib/util';

const EASE = 'cubic-bezier(0.2, 0, 0, 1)';

/** True one frame after mount, so rings draw themselves in from empty. */
function useDrawn() {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return drawn;
}

/** A circular progress ring, 0..1, with whatever is passed as children in the middle. */
export function Ring({
  value,
  size = 72,
  width = 5,
  tone = 'text-fg',
  className,
  children,
}: {
  value: number;
  size?: number;
  width?: number;
  /** Colour class of the filled part. */
  tone?: string;
  className?: string;
  children?: ReactNode;
}) {
  const drawn = useDrawn();
  const r = (size - width) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, drawn ? value : 0));
  return (
    <span className={cx('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={width} className="stroke-fg/[0.1]" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={width}
          stroke="currentColor"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          className={tone}
          style={{ transition: `stroke-dashoffset 900ms ${EASE}` }}
        />
      </svg>
      {children !== undefined && <span className="relative">{children}</span>}
    </span>
  );
}

const STAGES: { key: Stage; tone: string; label: string }[] = [
  { key: 'mastered', tone: 'text-fg', label: 'Mastered' },
  { key: 'familiar', tone: 'text-fg/55', label: 'Familiar' },
  { key: 'learning', tone: 'text-fg/25', label: 'Learning' },
  { key: 'new', tone: 'text-fg/[0.08]', label: 'New' },
];
export const STAGE_INFO = STAGES;

/** A ring split by how well the cards are known: the darker the arc, the better known. */
export function StageRing({ counts, size = 132, width = 9, children }: { counts: Record<Stage, number>; size?: number; width?: number; children?: ReactNode }) {
  const drawn = useDrawn();
  const total = STAGES.reduce((n, s) => n + counts[s.key], 0) || 1;
  const r = (size - width) / 2;
  const c = 2 * Math.PI * r;
  const parts = STAGES.filter((s) => counts[s.key] > 0);
  // A hairline of space between arcs, when there is more than one.
  const gap = parts.length > 1 ? 3 : 0;
  let start = 0;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        {parts.map((s) => {
          const len = (counts[s.key] / total) * c;
          const from = start;
          start += len;
          const shown = drawn ? Math.max(0.5, len - gap) : 0;
          return (
            <circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              strokeWidth={width}
              stroke="currentColor"
              strokeDasharray={`${shown} ${c - shown}`}
              strokeDashoffset={-from}
              className={s.tone}
              style={{ transition: `stroke-dasharray 900ms ${EASE}` }}
            />
          );
        })}
      </svg>
      {children !== undefined && <span className="relative">{children}</span>}
    </span>
  );
}

/** A number that counts up to its value when it appears or changes. */
export function Count({ value, format = (n: number) => String(Math.round(n)), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  const reduce = useReducedMotion();
  // The text is written here, never by React, so a re-render can't reset a count in progress.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      shown.current = value;
      el.textContent = format(value);
      return;
    }
    el.textContent = format(shown.current);
    const controls = animate(shown.current, value, {
      duration: 0.9,
      ease: [0.2, 0, 0, 1],
      onUpdate: (n) => {
        shown.current = n;
        el.textContent = format(n);
      },
    });
    return () => controls.stop();
    // `format` only shapes the text; restarting the count when its identity changes would be wrong.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce]);
  return <span ref={ref} className={cx('tabular-nums', className)} />;
}
