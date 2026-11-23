import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import Icon from './Icon';
import { useHotkeys } from '../lib/hotkeys';

interface ToastItem {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
  /** Something went wrong: stays until dismissed. */
  error?: boolean;
}

// Tiny module-level store: one toast at a time (a new one replaces the old).
let current: ToastItem | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

/** Show a short message at the bottom of the screen, optionally with an action (e.g. Undo). */
export function toast(message: string, action?: ToastItem['action']) {
  current = { id: ++seq, message, action };
  emit();
}

/** Say that something went wrong. Stays on screen until dismissed. */
export function toastError(message: string) {
  current = { id: ++seq, message, error: true };
  emit();
}

const dismiss = (id: number) => {
  if (current?.id === id) {
    current = null;
    emit();
  }
};

// Open dialogs sit in the browser's top layer, above everything else on the page. A toast has
// to be inside the topmost one to be seen (and read out) while it is open.
const hosts: HTMLElement[] = [];
export function toastHost(el: HTMLElement) {
  hosts.push(el);
  emit();
  return () => {
    const i = hosts.indexOf(el);
    if (i >= 0) hosts.splice(i, 1);
    emit();
  };
}
const topHost = () => hosts[hosts.length - 1] ?? null;

export function Toaster() {
  const t = useSyncExternalStore(subscribe, () => current);
  const host = useSyncExternalStore(subscribe, topHost);
  // Hovering or focusing the toast holds it (so there's time to read it and press Undo).
  const [held, setHeld] = useState(false);
  useEffect(() => setHeld(false), [t?.id]);
  useEffect(() => {
    if (!t || held || t.error) return;
    const timer = setTimeout(() => dismiss(t.id), t.action ? 10_000 : 5000);
    return () => clearTimeout(timer);
  }, [t, held]);

  // While an Undo is on offer, the usual undo key takes it.
  useHotkeys('Message', [{ keys: ['mod+z'], label: t?.action?.label, when: !!t?.action, inDialog: true, run: () => (t!.action!.run(), dismiss(t!.id)) }]);

  // With reduced motion the toast only fades.
  const reduce = useReducedMotion();
  const blur = (px: number) => (reduce ? {} : { filter: `blur(${px}px)` });

  return createPortal(
    <div role={t?.error ? 'alert' : 'status'} aria-live={t?.error ? 'assertive' : 'polite'} className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[110] flex justify-center px-4">
      <AnimatePresence mode="popLayout">
        {t && (
          <m.div
            key={t.id}
            initial={{ opacity: 0, y: 12, ...blur(4) }}
            animate={{ opacity: 1, y: 0, ...blur(0), transition: { duration: 0.25, ease: 'easeOut' } }}
            exit={{ opacity: 0, y: 8, ...blur(4), transition: { duration: 0.15, ease: 'easeOut' } }}
            className="pointer-events-auto flex max-w-md min-w-0 items-center gap-1 rounded-3xl border border-line bg-raised py-1.5 pr-1.5 pl-5 text-sm text-fg shadow-xl shadow-black/20"
            onPointerEnter={() => setHeld(true)}
            onPointerLeave={() => setHeld(false)}
            onFocus={() => setHeld(true)}
            onBlur={() => setHeld(false)}
          >
            <span className="min-w-0 py-1.5 pr-2 text-pretty">{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
                className="relative shrink-0 rounded-full bg-fg px-3 py-1.5 text-xs font-semibold text-bg transition-[opacity,scale] duration-150 ease-out after:absolute after:-inset-2 hover:opacity-85 not-disabled:active:scale-[0.96]"
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="relative flex size-8 shrink-0 items-center justify-center rounded-full text-muted transition-[color,background-color,scale] duration-150 ease-out after:absolute after:-inset-1.5 hover:bg-fg/[0.08] hover:text-fg not-disabled:active:scale-[0.96]"
            >
              <Icon name="close" size={14} />
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </div>,
    host ?? document.body,
  );
}
