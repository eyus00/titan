import { useEffect, useRef, type ReactNode } from 'react';
import { m, useIsPresent } from 'motion/react';
import Button, { btn } from './Button';
import Icon from './Icon';
import { toastHost } from './Toast';
import { cx } from '../lib/util';

/**
 * Native modal dialog: the browser moves focus in, keeps Tab inside, makes the page behind it
 * inert and maps Escape to `onClose`. Focus returns to whatever opened it.
 *
 * Render dialogs inside <AnimatePresence> so they can animate out:
 *   <AnimatePresence>{open && <Dialog … />}</AnimatePresence>
 */
function Modal({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  // Messages (toasts) show inside the topmost dialog while it is open, not once it starts to close.
  const present = useIsPresent();
  useEffect(() => (present && ref.current ? toastHost(ref.current) : undefined), [present]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    // Focus goes to the element that asks for it, or else to the panel itself, so no control
    // is ringed (or pressed by a stray Enter) just because the dialog opened.
    (dialog?.querySelector<HTMLElement>('[data-autofocus]') ?? dialog?.querySelector<HTMLElement>('[data-panel]'))?.focus({ preventScroll: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        close.current();
      }}
      className="m-0 h-full max-h-none w-full max-w-none overflow-visible border-0 bg-transparent p-0 text-fg backdrop:bg-transparent"
    >
      {children}
    </dialog>
  );
}

const EASE = [0.2, 0, 0, 1] as const;

/**
 * A standard dialog: a centered card on larger screens, a sheet from the bottom on phones. Title
 * and close button on top, a scrolling body, and an optional footer that stays put.
 */
export function Dialog({
  title,
  subtitle,
  onClose,
  footer,
  wide,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Modal label={title} onClose={onClose}>
      <m.div
        className="fixed inset-0 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.25, ease: 'easeOut' } }}
        exit={{ opacity: 0, transition: { duration: 0.15, ease: 'easeOut' } }}
      >
        <m.div
          className={cx(
            'flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface outline-none sm:max-h-[86dvh] sm:rounded-3xl',
            wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
          )}
          onClick={(e) => e.stopPropagation()}
          data-panel
          tabIndex={-1}
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: EASE } }}
          exit={{ opacity: 0, y: 12, scale: 0.99, transition: { duration: 0.15, ease: 'easeOut' } }}
        >
          <header className="flex shrink-0 items-start gap-3 px-5 pt-5 pb-3 sm:px-6">
            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-[1.75rem] leading-tight tracking-[-0.01em] text-balance">{title}</h2>
              {subtitle && <p className="mt-0.5 text-sm text-pretty text-muted">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close dialog" className={cx(btn({ variant: 'ghost', icon: true }), '-mt-1 -mr-2')}>
              <Icon name="close" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6">{children}</div>
          {footer && (
            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-6">
              {footer}
            </footer>
          )}
        </m.div>
      </m.div>
    </Modal>
  );
}

/** "Are you sure?" with one clear action. */
export function Confirm({
  title,
  body,
  action,
  cancel = 'Cancel',
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  body: ReactNode;
  action: string;
  /** The label of the way out, when "Cancel" would be unclear ("Keep editing"). */
  cancel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          {/* The keyboard starts on the safe choice when the action destroys something. */}
          <Button onClick={onClose} data-autofocus={danger || undefined}>
            {cancel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} data-autofocus={!danger || undefined}>
            {action}
          </Button>
        </>
      }
    >
      <p className="text-body leading-relaxed text-pretty text-muted">{body}</p>
    </Dialog>
  );
}
