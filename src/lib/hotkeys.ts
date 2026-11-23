import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getState } from './store';

/**
 * Keyboard shortcuts. A component declares the keys that work while it is on screen; the
 * shortcuts dialog (press ?) lists whatever is declared at that moment.
 *
 * A key is written like "n", "Enter", "ArrowLeft", "?" or with modifiers "mod+s"
 * (mod = Cmd on a Mac, Ctrl elsewhere) and "shift+m".
 */
export interface Hotkey {
  keys: string[];
  /** What it does, for the shortcuts dialog. Leave out to keep it off the list. */
  label?: string;
  run: (e: KeyboardEvent) => void;
  /** Off while false. */
  when?: boolean;
  /** Also fires while typing in a field (for things like mod+s). */
  inFields?: boolean;
  /** Also fires while a dialog is open (for keys that belong to that dialog). */
  inDialog?: boolean;
}

interface Group {
  title: string;
  list: Hotkey[];
}

const groups = new Set<{ current: Group }>();
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version++;
  listeners.forEach((l) => l());
};

function matches(e: KeyboardEvent, spec: string) {
  const parts = spec.split('+');
  const key = parts.pop()!;
  const mod = parts.includes('mod');
  const shift = parts.includes('shift');
  if (mod !== (e.metaKey || e.ctrlKey) || e.altKey) return false;
  // "?" and other symbols already imply shift, so only letters and named keys check it.
  if ((key.length > 1 || /[a-z]/i.test(key)) && shift !== e.shiftKey) return false;
  return e.key.toLowerCase() === key.toLowerCase();
}

/** Whether the person's last action was on the keyboard (rather than a tap or click). */
let keyboard = false;
export const usingKeyboard = () => keyboard;

/** A shortcut that is one plain character ("n", "?", "1"), as opposed to Enter, arrows or Cmd+S. */
export const isSingleKey = (spec: string) => spec.length === 1 && spec !== ' ';

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => (keyboard = false), true);
  window.addEventListener('keydown', () => (keyboard = true), true);
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing) return;
    // Enter and Space belong to the control the keyboard is on: someone who tabbed to a button
    // and presses Enter means that button, whatever shortcut the same key has on this page.
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.matches('button:focus-visible, a:focus-visible, [role="button"]:focus-visible, summary:focus-visible')) return;
    const inField = typing(e.target);
    const inDialog = !!document.querySelector('dialog[open]');
    const singles = getState().settings.shortcuts;
    // Later groups (deeper in the page) win over earlier ones.
    for (const group of [...groups].reverse()) {
      for (const hk of group.current.list) {
        if (hk.when === false || (inField && !hk.inFields) || (inDialog && !hk.inDialog)) continue;
        if (!hk.keys.some((k) => (singles || !isSingleKey(k)) && matches(e, k))) continue;
        e.preventDefault();
        hk.run(e);
        return;
      }
    }
  });
}

/** Declare the shortcuts that work while this component is mounted. */
export function useHotkeys(title: string, list: Hotkey[]) {
  const ref = useRef<Group>({ title, list });
  ref.current = { title, list };
  useEffect(() => {
    groups.add(ref);
    changed();
    return () => {
      groups.delete(ref);
      changed();
    };
  }, []);
}

/** The shortcuts available right now, grouped, for the shortcuts dialog. */
export function useActiveHotkeys(): Group[] {
  useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => version,
  );
  const singles = getState().settings.shortcuts;
  return [...groups]
    .map((g) => ({
      title: g.current.title,
      // With single-key shortcuts off, only the keys that still work are listed.
      list: g.current.list
        .filter((h) => h.label && h.when !== false)
        .map((h) => (singles ? h : { ...h, keys: h.keys.filter((k) => !isSingleKey(k)) }))
        .filter((h) => h.keys.length),
    }))
    .filter((g) => g.list.length);
}

const NAMES: Record<string, string> = {
  mod: typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl',
  shift: '⇧',
  enter: '↵',
  escape: 'Esc',
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  arrowdown: '↓',
  ' ': 'Space',
  backspace: '⌫',
};

/** "mod+s" -> ["⌘", "S"], for showing a shortcut as key caps. */
export const keyCaps = (spec: string) => spec.split('+').map((k) => NAMES[k.toLowerCase()] ?? (k.length === 1 ? k.toUpperCase() : k));
