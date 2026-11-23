import { useEffect, useState, useSyncExternalStore } from 'react';

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
      {t && (
        <div
          key={t.id}
          role="status"
          className="rise-in pointer-events-auto flex max-w-md min-w-0 items-center gap-3 rounded-full border border-line bg-raised py-1.5 pr-1.5 pl-5 text-sm text-fg shadow-xl shadow-black/20"
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
              className="-ml-2 shrink-0 rounded-full bg-fg px-3 py-1.5 text-xs font-semibold text-bg transition hover:opacity-85"
            >
              {t.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
