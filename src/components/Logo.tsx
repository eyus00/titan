import { cx } from '../lib/util';

/**
 * Titan's mark: a T cut from two cards, a bar and a blade, each with one corner sliced off.
 * Inline SVG, no request. The same shapes are in public/favicon.svg.
 */
export function LogoMark({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M2 2.5h20L18 9H2z" />
      <path d="M7.5 11h7v4.5l-7 7z" />
    </svg>
  );
}

/** The mark with "Titan" beside it. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('flex items-center gap-2.5', className)}>
      <LogoMark className="size-[21px]" />
      <span className="font-serif text-[1.7rem] leading-none tracking-[-0.01em]">Titan</span>
    </span>
  );
}
