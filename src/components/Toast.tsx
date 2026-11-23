import { useEffect, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, m } from 'motion/react';

interface ToastItem {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

// Tiny module-level store: one toast at a time (a new one replaces the old).
let current: ToastItem | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Show a short message at the bottom of the screen, optionally with an action (e.g. Undo). */
export function toast(message: string, action?: ToastItem['action']) {
  current = { id: ++seq, message, action };
  emit();
}

const dismiss = (id: number) => {
  if (current?.id === id) {
    current = null;
    emit();
  }
};

export function Toaster() {
  const t = useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => current,
  );
  // Hovering or focusing the toast holds it (so there's time to read it and press Undo).
  const [held, setHeld] = useState(false);
  useEffect(() => setHeld(false), [t?.id]);
  useEffect(() => {
    if (!t || held) return;
    const timer = setTimeout(() => dismiss(t.id), t.action ? 7000 : 3200);
    return () => clearTimeout(timer);
  }, [t, held]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[110] flex justify-center px-4">
      <AnimatePresence mode="popLayout">
        {t && (
          <m.div
            key={t.id}
            role="status"
            initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.25, ease: 'easeOut' } }}
            exit={{ opacity: 0, y: 8, filter: 'blur(4px)', transition: { duration: 0.15, ease: 'easeOut' } }}
            className="pointer-events-auto flex max-w-md min-w-0 items-center gap-3 rounded-full border border-line bg-raised py-1.5 pr-1.5 pl-5 text-sm text-fg shadow-xl shadow-black/20"
            onPointerEnter={() => setHeld(true)}
            onPointerLeave={() => setHeld(false)}
            onFocus={() => setHeld(true)}
            onBlur={() => setHeld(false)}
          >
            <span className="min-w-0 truncate py-1.5 pr-3">{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
                className="-ml-2 shrink-0 rounded-full bg-fg px-3 py-1.5 text-xs font-semibold text-bg transition-[opacity,scale] duration-150 ease-out hover:opacity-85 active:scale-[0.96]"
              >
                {t.action.label}
              </button>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
