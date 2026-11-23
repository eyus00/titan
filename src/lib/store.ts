import { useSyncExternalStore } from 'react';
import { dayKey, review, type CardStat, type Stats } from './learn';
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
  /** Best match time in ms, per number of pairs in the round ("8" -> 12400). */
  best: Record<string, number>;
  /** Boards cleared. */
  plays: number;
  /** What is known about each card, by card id (see lib/learn.ts). */
  stats: Stats;
}

export type ThemePref = 'system' | 'dark' | 'light';

export interface OwnTrack {
  id: string;
  name: string;
}

export interface Settings {
  theme: ThemePref;
  /** Pairs dealt per board (fewer when the set or the screen is smaller). */
  pairs: number;
  /** Match keeps dealing boards until stopped. */
  endless: boolean;
  sfx: boolean;
  music: boolean;
  /** 0..1 */
  musicVolume: number;
  /** A built-in song id, "shuffle", or "own:<id>" for one of the viewer's files. */
  track: string;
  /** The viewer's own audio files (the audio itself lives in IndexedDB, see lib/music.ts). */
  ownTracks: OwnTrack[];
  /** Which side flashcards show first. */
  front: 'term' | 'def';
}

interface State {
  sets: StudySet[];
  settings: Settings;
  /** Answers given per day ("2026-11-23" -> 42), for the streak. */
  activity: Record<string, number>;
}

export const PAIR_CHOICES = [4, 6, 8, 10] as const;

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  pairs: 8,
  endless: false,
  sfx: true,
  music: true,
  musicVolume: 0.6,
  track: 'orbit',
  ownTracks: [],
  front: 'term',
};

// ---------- persistence ----------

/** Everything lives in this one localStorage entry (index.html reads the theme from it too). */
const KEY = 'titan:v1';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

function cleanStat(raw: unknown): CardStat | null {
  const r = obj(raw);
  const seen = num(r.seen, 0);
  if (seen <= 0) return null;
  return {
    seen,
    right: num(r.right, 0),
    wrong: num(r.wrong, 0),
    streak: num(r.streak, 0),
    half: Math.max(60_000, num(r.half, 60_000)),
    heat: num(r.heat, 0),
    last: num(r.last, Date.now()),
    mix: str(r.mix) || undefined,
  };
}

/** Accept whatever was stored or imported and return a well-formed set (or null). */
function cleanSet(raw: unknown): StudySet | null {
  const r = obj(raw);
  if (!Array.isArray(r.cards)) return null;
  const cards: Card[] = [];
  for (const c of r.cards) {
    const o = obj(c);
    // Backups from other tools often say "definition".
    const def = str(o.def) || str(o.definition);
    if (!str(o.term) && !def) continue;
    cards.push({ id: str(o.id) || uid(), term: str(o.term), def });
  }
  const best: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(r.best))) {
    if (typeof v === 'number' && v > 0) best[k] = v;
  }
  const ids = new Set(cards.map((c) => c.id));
  const stats: Stats = {};
  for (const [id, s] of Object.entries(obj(r.stats))) {
    const stat = ids.has(id) ? cleanStat(s) : null;
    if (stat) stats[id] = stat;
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
    stats,
  };
}

function cleanSettings(raw: unknown): Settings {
  const r = obj(raw);
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (r.theme === 'dark' || r.theme === 'light' || r.theme === 'system') s.theme = r.theme;
  if (typeof r.pairs === 'number' && r.pairs >= 2) s.pairs = r.pairs;
  if (typeof r.endless === 'boolean') s.endless = r.endless;
  if (typeof r.sfx === 'boolean') s.sfx = r.sfx;
  if (typeof r.music === 'boolean') s.music = r.music;
  if (typeof r.musicVolume === 'number') s.musicVolume = Math.min(1, Math.max(0, r.musicVolume));
  if (r.front === 'def') s.front = 'def';
  if (Array.isArray(r.ownTracks)) {
    s.ownTracks = r.ownTracks.map(obj).filter((t) => str(t.id) && str(t.name)).map((t) => ({ id: str(t.id), name: str(t.name) }));
  }
  if (typeof r.track === 'string') s.track = r.track;
  // Before there were several tracks, one own file was kept under the id "music".
  if (typeof r.customTrack === 'string' && r.customTrack && !s.ownTracks.length) {
    s.ownTracks = [{ id: 'music', name: r.customTrack }];
    s.track = 'own:music';
  }
  if (s.track.startsWith('own:') && !s.ownTracks.some((t) => `own:${t.id}` === s.track)) s.track = DEFAULT_SETTINGS.track;
  return s;
}

function load(): State {
  try {
    const raw = obj(JSON.parse(localStorage.getItem(KEY) || 'null'));
    const sets = Array.isArray(raw.sets) ? (raw.sets.map(cleanSet).filter(Boolean) as StudySet[]) : [];
    const activity: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj(raw.activity))) if (typeof v === 'number' && v > 0) activity[k] = v;
    return { sets, settings: cleanSettings(raw.settings), activity };
  } catch {
    return { sets: [], settings: DEFAULT_SETTINGS, activity: {} };
  }
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

/** Cards that can be studied: both sides filled in, exact duplicates dropped. */
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

/** How many pairs a board of this set deals with the current setting. */
export const roundSize = (available: number, wanted: number) => Math.max(0, Math.min(available, wanted));

const mapSet = (id: string, change: (s: StudySet) => StudySet) => state.sets.map((s) => (s.id === id ? change(s) : s));

// ---------- actions ----------

type Draft = { title: string; cards: { id?: string; term: string; def: string }[] };

const tidy = (draft: Draft) => ({
  title: draft.title.trim() || 'Untitled set',
  cards: draft.cards
    .map((c) => ({ id: c.id || uid(), term: c.term.trim(), def: c.def.trim() }))
    .filter((c) => c.term || c.def),
});

export interface Answer {
  id: string;
  correct: boolean;
  /** For a wrong answer in Match: the card it was confused with. */
  mixedWith?: string;
}

export const actions = {
  createSet(draft: Draft): StudySet {
    const now = Date.now();
    const set: StudySet = { id: uid(), ...tidy(draft), createdAt: now, updatedAt: now, best: {}, plays: 0, stats: {} };
    commit({ ...state, sets: [set, ...state.sets] });
    return set;
  },

  updateSet(id: string, draft: Draft) {
    const next = tidy(draft);
    const ids = new Set(next.cards.map((c) => c.id));
    commit({
      ...state,
      sets: mapSet(id, (s) => ({
        ...s,
        ...next,
        updatedAt: Date.now(),
        // Progress belongs to cards: drop it for the ones that were removed.
        stats: Object.fromEntries(Object.entries(s.stats).filter(([cid]) => ids.has(cid))),
      })),
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

  /** Record answers from any study mode: updates each card's memory and today's activity. */
  answer(setId: string, answers: Answer[]) {
    if (!answers.length) return;
    const now = Date.now();
    const today = dayKey(now);
    commit({
      ...state,
      activity: { ...state.activity, [today]: (state.activity[today] ?? 0) + answers.length },
      sets: mapSet(setId, (s) => {
        const stats = { ...s.stats };
        for (const a of answers) stats[a.id] = review(stats[a.id], a.correct, now, a.mixedWith);
        return { ...s, stats };
      }),
    });
  },

  /** Take one answer back (Undo in flashcards): restore the card's earlier stats. */
  unanswer(setId: string, cardId: string, before: CardStat | undefined) {
    const today = dayKey(Date.now());
    commit({
      ...state,
      activity: { ...state.activity, [today]: Math.max(0, (state.activity[today] ?? 0) - 1) },
      sets: mapSet(setId, (s) => {
        const stats = { ...s.stats };
        if (before) stats[cardId] = before;
        else delete stats[cardId];
        return { ...s, stats };
      }),
    });
  },

  /** A cleared board. With `ms`, also a timed round: returns the earlier best for that size. */
  recordBoard(id: string, pairs: number, ms?: number): { previous: number | undefined; isBest: boolean } {
    const set = state.sets.find((s) => s.id === id);
    if (!set) return { previous: undefined, isBest: false };
    const previous = set.best[pairs];
    const isBest = ms !== undefined && (previous === undefined || ms < previous);
    commit({
      ...state,
      sets: mapSet(id, (s) => ({ ...s, plays: s.plays + 1, best: isBest ? { ...s.best, [pairs]: ms! } : s.best })),
    });
    return { previous, isBest };
  },

  /** Forget everything learned about a set (its cards stay). */
  resetProgress(id: string) {
    commit({ ...state, sets: mapSet(id, (s) => ({ ...s, stats: {}, best: {}, plays: 0 })) });
  },

  setSettings(patch: Partial<Settings>) {
    commit({ ...state, settings: { ...state.settings, ...patch } });
  },

  /** Add sets from a backup file. Sets whose id already exists are replaced. Returns how many were read. */
  importBackup(raw: unknown): number {
    const list = Array.isArray(raw) ? raw : Array.isArray(obj(raw).sets) ? (obj(raw).sets as unknown[]) : [];
    const incoming = list.map(cleanSet).filter(Boolean) as StudySet[];
    if (!incoming.length) return 0;
    const ids = new Set(incoming.map((s) => s.id));
    commit({ ...state, sets: [...incoming, ...state.sets.filter((s) => !ids.has(s.id))].sort((a, b) => b.updatedAt - a.updatedAt) });
    return incoming.length;
  },
};

/** Everything worth backing up, as JSON text. */
export const exportBackup = () => JSON.stringify({ app: 'titan', version: 1, exportedAt: new Date().toISOString(), sets: state.sets }, null, 2);
