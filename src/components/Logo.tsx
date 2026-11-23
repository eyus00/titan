import { cx } from '../lib/util';

/** Titan's mark: two cards, one matched onto the other. Inline SVG, no request. */
export function LogoMark({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="2.9" y="2.9" width="13" height="13" rx="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="8" y="8" width="14" height="14" rx="3.6" fill="currentColor" />
    </svg>
  );
}

/** The mark with "Titan" beside it. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('flex items-center gap-2.5', className)}>
      <LogoMark className="size-[22px]" />
      <span className="font-serif text-[1.7rem] leading-none tracking-[-0.01em]">Titan</span>
    </span>
  );
}
