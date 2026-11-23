import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import Button, { btn } from './Button';
import { cx } from '../lib/util';

/**
 * Native modal dialog: the browser moves focus in, keeps Tab inside, makes the page behind it
 * inert and maps Escape to `onClose`. Focus returns to whatever opened it.
 */
function Modal({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
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
      <div className="fade-in fixed inset-0 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
        <div
          className={cx(
            'rise-in flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface sm:max-h-[86dvh] sm:rounded-3xl',
            wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex shrink-0 items-start gap-3 px-5 pt-5 pb-3 sm:px-6">
            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-[1.75rem] leading-tight tracking-[-0.01em]">{title}</h2>
              {subtitle && <p className="mt-0.5 text-sm text-pretty text-muted">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className={cx(btn({ variant: 'ghost', icon: true }), '-mt-1 -mr-2')}>
              <X className="size-[18px]" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6">{children}</div>
          {footer && (
            <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-6">
              {footer}
            </footer>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** "Are you sure?" with one clear action. */
export function Confirm({
  title,
  body,
  action,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  body: ReactNode;
  action: string;
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
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} autoFocus>
            {action}
          </Button>
        </>
      }
    >
      <p className="text-[15px] leading-relaxed text-pretty text-muted">{body}</p>
    </Dialog>
  );
}
