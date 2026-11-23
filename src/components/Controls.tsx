import type { ReactNode } from 'react';
import { cx } from '../lib/util';

/** A row of pills where exactly one is chosen (theme, separators, pairs per round). */
export function Choice<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: readonly { value: T; label: ReactNode; disabled?: boolean }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('flex flex-wrap gap-1.5', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors duration-150 disabled:opacity-30',
              on ? 'bg-fg text-bg' : 'bg-fg/[0.07] text-muted hover:bg-fg/[0.13] hover:text-fg',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** On/off switch. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative h-6 w-10 shrink-0 rounded-full transition-colors duration-150', checked ? 'bg-fg' : 'bg-fg/[0.16]')}
    >
      <span className={cx('absolute top-0.5 left-0.5 size-5 rounded-full transition-transform duration-150 ease-out', checked ? 'translate-x-4 bg-bg' : 'bg-fg/70')} />
    </button>
  );
}

/** A labelled row in a settings list: text on the left, a control on the right. */
export function Field({ title, hint, children, stack }: { title: string; hint?: ReactNode; children: ReactNode; stack?: boolean }) {
  return (
    <div className={cx('flex gap-x-4 gap-y-2.5 py-3.5', stack ? 'flex-col' : 'items-center justify-between')}>
      <div className="min-w-0">
        <div className="text-[15px]">{title}</div>
        {hint && <div className="mt-0.5 text-[13px] text-pretty text-muted">{hint}</div>}
      </div>
      <div className={cx(!stack && 'shrink-0')}>{children}</div>
    </div>
  );
}
