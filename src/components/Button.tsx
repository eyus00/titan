import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cx } from '../lib/util';

/**
 * The app's one button system:
 * - primary: text-colour fill. The single main action on a surface (Play, Save, Start).
 * - secondary: a plain soft fill. Every other action.
 * - ghost: nothing until hovered. Icons in toolbars.
 * - danger: for the confirm step of deleting something.
 * Sizes: sm = 32px, md = 40px, lg = 48px. `icon` makes it a circle for icon-only buttons.
 * Every button gives a little under the press (scale 0.96).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap select-none ' +
  'transition-[background-color,color,opacity,scale] duration-150 ease-out not-disabled:active:scale-[0.96] ' +
  'disabled:pointer-events-none disabled:opacity-35 aria-disabled:pointer-events-none aria-disabled:opacity-35';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-fg text-bg hover:opacity-85',
  secondary: 'bg-fg/[0.08] text-fg hover:bg-fg/[0.14]',
  ghost: 'text-muted hover:bg-fg/[0.08] hover:text-fg',
  danger: 'bg-bad text-bg hover:opacity-85',
};

const SIZE: Record<ButtonSize, { text: string; icon: string }> = {
  sm: { text: 'h-8 px-3 text-caption', icon: 'size-8' },
  md: { text: 'h-10 px-4 text-sm', icon: 'size-10' },
  lg: { text: 'h-12 px-5 text-body', icon: 'size-12' },
};

/** Class string, for links and anything else that should look like a button. */
export function btn({ variant = 'secondary', size = 'md', icon = false }: { variant?: ButtonVariant; size?: ButtonSize; icon?: boolean } = {}) {
  return cx(BASE, VARIANT[variant], icon ? SIZE[size].icon : SIZE[size].text);
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; icon?: boolean };

const Button = forwardRef<HTMLButtonElement, Props>(function Button({ variant, size, icon, className, type = 'button', ...rest }, ref) {
  return <button ref={ref} type={type} className={cx(btn({ variant, size, icon }), className)} {...rest} />;
});
export default Button;
