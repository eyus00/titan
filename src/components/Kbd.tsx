import type { ReactNode } from 'react';
import { cx } from '../lib/util';

/** Is this an Apple keyboard? Decides between the command sign and "Ctrl". */
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD = isMac ? '⌘' : 'Ctrl';

/**
 * A keyboard cue: the key that does what the thing beside it does. Only shown where there is a
 * keyboard to press (a mouse or trackpad device), never on touch screens.
 * `on` flips the colours for use on a filled (primary) button.
 */
export default function Kbd({ children, className, on }: { children: ReactNode; className?: string; on?: boolean }) {
  return (
    <kbd
      className={cx(
        'hidden h-[18px] min-w-[18px] items-center justify-center rounded-[5px] px-1 font-mono text-[10.5px] leading-none font-medium keys:inline-flex',
        on ? 'bg-bg/15 text-bg/70' : 'bg-fg/[0.08] text-muted',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
