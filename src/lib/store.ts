import { useSyncExternalStore } from 'react';
import { uid } from './util';

// ---------- types ----------

export interface Card {
  id: string;
  term: string;
  def: string;
}

export interface StudySet {
  id: string;
  title: string;
  cards: Card[];
  createdAt: number;
  updatedAt: number;
  /** Best match time in ms, per number of pairs in the round ("6" -> 12400). */
  best: Record<string, number>;
  plays: number;
}

export type ThemePref = 'system' | 'dark' | 'light';

export interface Settings {
  theme: ThemePref;
  /** Pairs dealt per round (fewer when the set is smaller). */
  pairs: number;
  sfx: boolean;
  music: boolean;
  /** 0..1 */
  musicVolume: number;
  /** File name of the viewer's own track (the audio itself lives in IndexedDB), or null for the built-in theme. */
  customTrack: string | null;
}

interface State {
  sets: StudySet[];
  settings: Settings;
}

export const PAIR_CHOICES = [4, 6, 8, 10] as const;

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  pairs: 6,
  sfx: true,
  music: true,
  musicVolume: 0.6,
  customTrack: null,
};

// ---------- persistence ----------

/** Everything lives in this one localStorage entry (index.html reads the theme from it too). */
const KEY = 'titan:v1';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Accept whatever was stored or imported and return a well-formed set (or null). */
function cleanSet(raw: unknown): StudySet | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.cards)) return null;
  const cards: Card[] = [];
  for (const c of r.cards) {
    if (!c || typeof c !== 'object') continue;
    const o = c as Record<string, unknown>;
    // Backups from other tools often say "definition".
    const def = str(o.def) || str(o.definition);
    if (!str(o.term) && !def) continue;
    cards.push({ id: str(o.id) || uid(), term: str(o.term), def });
  }
  const best: Record<string, number> = {};
  if (r.best && typeof r.best === 'object') {
    for (const [k, v] of Object.entries(r.best as Record<string, unknown>)) {
      if (typeof v === 'number' && v > 0) best[k] = v;
    }
  }
  const now = Date.now();
  return {
    id: str(r.id) || uid(),
    title: str(r.title).trim() || 'Untitled set',
    cards,
    createdAt: num(r.createdAt, now),
    updatedAt: num(r.updatedAt, now),
    best,
    plays: num(r.plays, 0),
  };
}

function load(): State {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      const sets = Array.isArray(raw.sets) ? (raw.sets.map(cleanSet).filter(Boolean) as StudySet[]) : [];
      return { sets, settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) } };
    }
  } catch {
    // unreadable storage: start fresh
  }
  return { sets: [], settings: DEFAULT_SETTINGS };
}

let state = load();
const listeners = new Set<() => void>();

function commit(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage full or blocked: keep working in memory
  }
  listeners.forEach((l) => l());
}

// Another tab changed something: pick it up.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    state = load();
    listeners.forEach((l) => l());
  });
}

export const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

/** Read from the store. Select existing objects (not new ones) so renders stay cheap. */
export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

export const getState = () => state;

// ---------- helpers ----------

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Cards that can be played: both sides filled in, exact duplicates dropped. */
export function playable(set: StudySet): Card[] {
  const seen = new Set<string>();
  return set.cards.filter((c) => {
    if (!c.term.trim() || !c.def.trim()) return false;
    const key = norm(c.term) + '\u0000' + norm(c.def);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Whether a term and a definition belong together (also true when two cards share a term or a definition). */
export function isPair(cards: Card[], term: string, def: string) {
  const t = norm(term);
  const d = norm(def);
  return cards.some((c) => norm(c.term) === t && norm(c.def) === d);
}

/** How many pairs a round of this set deals with the current setting. */
export const roundSize = (available: number, wanted: number) => Math.max(0, Math.min(available, wanted));

// ---------- actions ----------

type Draft = { title: string; cards: { id?: string; term: string; def: string }[] };

const tidy = (draft: Draft) => ({
  title: draft.title.trim() || 'Untitled set',
  cards: draft.cards
    .map((c) => ({ id: c.id || uid(), term: c.term.trim(), def: c.def.trim() }))
    .filter((c) => c.term || c.def),
});

export const actions = {
  createSet(draft: Draft): StudySet {
    const now = Date.now();
    const set: StudySet = { id: uid(), ...tidy(draft), createdAt: now, updatedAt: now, best: {}, plays: 0 };
    commit({ ...state, sets: [set, ...state.sets] });
    return set;
  },

  updateSet(id: string, draft: Draft) {
    commit({
      ...state,
      sets: state.sets.map((s) => (s.id === id ? { ...s, ...tidy(draft), updatedAt: Date.now() } : s)),
    });
  },

  deleteSet(id: string) {
    commit({ ...state, sets: state.sets.filter((s) => s.id !== id) });
  },

  /** Put a deleted set back (Undo). */
  restoreSet(set: StudySet) {
    if (state.sets.some((s) => s.id === set.id)) return;
    commit({ ...state, sets: [set, ...state.sets].sort((a, b) => b.updatedAt - a.updatedAt) });
  },

  /** Record a finished round. Returns the previous best for that round size (undefined on the first play). */
  recordResult(id: string, pairs: number, ms: number): { previous: number | undefined; isBest: boolean } {
    const set = state.sets.find((s) => s.id === id);
    if (!set) return { previous: undefined, isBest: false };
    const previous = set.best[pairs];
    const isBest = previous === undefined || ms < previous;
    commit({
      ...state,
      sets: state.sets.map((s) =>
        s.id === id ? { ...s, plays: s.plays + 1, best: isBest ? { ...s.best, [pairs]: ms } : s.best } : s,
      ),
    });
    return { previous, isBest };
  },

  setSettings(patch: Partial<Settings>) {
    commit({ ...state, settings: { ...state.settings, ...patch } });
  },

  /** Add sets from a backup file. Sets whose id already exists are replaced. Returns how many were read. */
  importBackup(raw: unknown): number {
    const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { sets?: unknown }).sets) ? (raw as { sets: unknown[] }).sets : [];
    const incoming = list.map(cleanSet).filter(Boolean) as StudySet[];
    if (!incoming.length) return 0;
    const ids = new Set(incoming.map((s) => s.id));
    commit({ ...state, sets: [...incoming, ...state.sets.filter((s) => !ids.has(s.id))].sort((a, b) => b.updatedAt - a.updatedAt) });
    return incoming.length;
  },
};

/** Everything worth backing up, as JSON text. */
export const exportBackup = () => JSON.stringify({ app: 'titan', version: 1, exportedAt: new Date().toISOString(), sets: state.sets }, null, 2);
