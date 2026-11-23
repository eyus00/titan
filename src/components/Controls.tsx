import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { m } from 'motion/react';
import { cx } from '../lib/util';

/**
 * A row of pills where exactly one is chosen (theme, separators, pairs per round). The filled
 * pill slides from the old choice to the new one. Arrow keys move the choice, as in any radio group.
 */
export function Choice<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: readonly { value: T; label: ReactNode; disabled?: boolean; title?: string }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const id = useId();
  const group = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    const usable = options.filter((o) => !o.disabled);
    const at = usable.findIndex((o) => o.value === value);
    const next = usable[(at + step + usable.length) % usable.length];
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    onChange(next.value);
    // Focus follows the choice.
    requestAnimationFrame(() => group.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  };

  return (
    <div ref={group} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={cx('flex flex-wrap gap-1.5', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              'relative inline-flex h-8 items-center rounded-full px-3 text-caption font-medium transition-[background-color,color,scale] duration-150 ease-out not-disabled:active:scale-[0.96] disabled:opacity-30',
              on ? 'text-bg' : 'bg-fg/[0.07] text-muted hover:bg-fg/[0.13] hover:text-fg',
            )}
          >
            {on && <m.span layoutId={id} className="absolute inset-0 rounded-full bg-fg" transition={{ type: 'spring', duration: 0.4, bounce: 0 }} />}
            <span className="relative inline-flex items-center gap-1.5">{o.label}</span>
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
      className={cx('group relative h-6 w-10 shrink-0 rounded-full transition-[color,background-color,border-color] duration-150 ease-out', checked ? 'bg-fg' : 'bg-fg/[0.16]')}
    >
      <span
        className={cx(
          'absolute top-0.5 left-0.5 size-5 rounded-full transition-[translate,scale,background-color] duration-200 ease-[cubic-bezier(0.2,0,0,1)] group-active:scale-90',
          checked ? 'translate-x-4 bg-bg' : 'bg-fg/70',
        )}
      />
    </button>
  );
}

/** A labelled row in a settings list: text on the left, a control on the right. */
export function Field({ title, hint, children, stack }: { title: string; hint?: ReactNode; children: ReactNode; stack?: boolean }) {
  // A row with one switch is a <label>, so the whole row is its hit area.
  const Row = stack ? 'div' : 'label';
  return (
    <Row className={cx('flex gap-x-4 gap-y-2.5 py-3.5', stack ? 'flex-col' : 'cursor-pointer items-center justify-between')}>
      <span className="block min-w-0">
        <span className="block text-body">{title}</span>
        {hint && <span className="mt-0.5 block text-caption text-pretty text-muted">{hint}</span>}
      </span>
      <span className={cx('block', !stack && 'shrink-0')}>{children}</span>
    </Row>
  );
}
