import type { ReactNode } from 'react';
import { useStore } from '../lib/store';
import { cx } from '../lib/util';

/** Is this an Apple keyboard? Decides between the command sign and "Ctrl". */
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD = isMac ? '⌘' : 'Ctrl';

/**
 * A keyboard cue: the key that does what the thing beside it does. Only shown where there is a
 * keyboard to press (a mouse or trackpad device), never on touch screens, and left out of the
 * control's spoken name. A cue for a single-letter key disappears when those are switched off
 * in Settings. `on` flips the colours for use on a filled (primary) button; `spoken` is for the
 * shortcuts list, where the key itself is the content.
 */
export default function Kbd({ children, className, on, spoken }: { children: ReactNode; className?: string; on?: boolean; spoken?: boolean }) {
  const singles = useStore((s) => s.settings.shortcuts);
  if (!singles && !spoken && typeof children === 'string' && children.length === 1 && /[a-z0-9,?]/i.test(children)) return null;
  return (
    <kbd
      aria-hidden={spoken ? undefined : true}
      className={cx(
        'hidden h-[18px] min-w-[18px] items-center justify-center rounded-[5px] px-1 font-mono text-[0.6875rem] leading-none font-medium normal-case keys:inline-flex',
        on ? 'bg-bg/15 text-bg/70' : 'bg-fg/[0.08] text-muted',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
