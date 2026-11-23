/**
 * How Titan keeps track of what you know, and how it chooses what to show next.
 *
 * Every card has a memory "half-life": the time after which you are about as likely to have
 * forgotten it as to remember it. A clean answer makes the half-life longer, and much longer
 * when the card had almost faded (spaced practice beats cramming). A mistake cuts it short
 * and marks the card as "hot", so it comes back soon and keeps coming back until it sticks.
 */
import type { Card } from './store';

export interface CardStat {
  /** Times answered. */
  seen: number;
  right: number;
  wrong: number;
  /** Clean answers in a row. */
  streak: number;
  /** Memory half-life in ms. */
  half: number;
  /** Recent trouble: +1 per mistake, fading with each clean answer. */
  heat: number;
  /** When it was last answered. */
  last: number;
  /** The card it was last mixed up with (dealt together again, to tell them apart). */
  mix?: string;
}

export type Stats = Record<string, CardStat>;
export type Stage = 'new' | 'learning' | 'familiar' | 'mastered';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const MIN_HALF = MINUTE;
const MAX_HALF = 120 * DAY;
/** Half-life after the very first answer. */
const FIRST_RIGHT = 30 * MINUTE;
const FIRST_WRONG = 2 * MINUTE;
/** A half-life this long counts as fully learned. */
const SOLID_HALF = 3 * DAY;
/** Clean answers in a row that count as full short-term confidence. */
const SOLID_STREAK = 4;
const MAX_HEAT = 4;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Chance (0..1) that the card is still remembered right now. */
export function recall(stat: CardStat | undefined, now: number) {
  if (!stat || !stat.seen) return 0;
  return 2 ** (-Math.max(0, now - stat.last) / stat.half);
}

/** Long-term strength (0..1) from the half-life, on a log scale from a minute to a few days. */
function strength(stat: CardStat) {
  return clamp(Math.log(stat.half / MIN_HALF) / Math.log(SOLID_HALF / MIN_HALF));
}

/**
 * How well a card is known right now, 0..1. Blends long-term strength with the current run of
 * clean answers, then fades with time away, so a ring that was full last month is not full today.
 */
export function mastery(stat: CardStat | undefined, now: number) {
  if (!stat || !stat.seen) return 0;
  const known = 0.6 * strength(stat) + 0.4 * clamp(stat.streak / SOLID_STREAK);
  return clamp(known * (0.6 + 0.4 * recall(stat, now)));
}

export function stage(stat: CardStat | undefined, now: number): Stage {
  if (!stat || !stat.seen) return 'new';
  const m = mastery(stat, now);
  return m >= 0.85 ? 'mastered' : m >= 0.5 ? 'familiar' : 'learning';
}

/** Worth reviewing now: probably fading, or recently missed. */
export function isDue(stat: CardStat | undefined, now: number) {
  return !!stat && stat.seen > 0 && (stat.heat >= 1 || recall(stat, now) < 0.5);
}

/** The card's stats after one more answer. */
export function review(stat: CardStat | undefined, correct: boolean, now: number, mixedWith?: string): CardStat {
  if (!stat || !stat.seen) {
    return correct
      ? { seen: 1, right: 1, wrong: 0, streak: 1, half: FIRST_RIGHT, heat: 0, last: now }
      : { seen: 1, right: 0, wrong: 1, streak: 0, half: FIRST_WRONG, heat: 1, last: now, mix: mixedWith };
  }
  if (correct) {
    // Remembering something that had nearly faded is worth far more than repeating it right away.
    const gain = 1.2 + 2.8 * (1 - recall(stat, now));
    const heat = stat.heat * 0.55;
    return {
      ...stat,
      seen: stat.seen + 1,
      right: stat.right + 1,
      streak: stat.streak + 1,
      half: Math.min(MAX_HALF, stat.half * gain),
      heat: heat < 0.05 ? 0 : heat,
      last: now,
      mix: heat < 0.3 ? undefined : stat.mix,
    };
  }
  return {
    ...stat,
    seen: stat.seen + 1,
    wrong: stat.wrong + 1,
    streak: 0,
    half: Math.max(MIN_HALF, stat.half * 0.4),
    heat: Math.min(MAX_HEAT, stat.heat + 1),
    last: now,
    mix: mixedWith ?? stat.mix,
  };
}

/** How much a card needs to be shown. Higher = sooner. */
export function need(stat: CardStat | undefined, now: number) {
  if (!stat || !stat.seen) return 0.9;
  return 0.2 + 1.6 * (1 - recall(stat, now)) + 0.8 * Math.min(stat.heat, 3) + 0.4 * (1 - strength(stat));
}

interface RankOptions {
  now: number;
  /** Cards shown a moment ago: held back unless they were missed. */
  recent?: ReadonlySet<string>;
  /** Cards that must not be chosen (already on the table). */
  exclude?: ReadonlySet<string>;
}

/**
 * Every card in the order it should be dealt: a weighted shuffle, so cards that need work come
 * up far more often, while well-known ones still return now and then to stay known.
 */
export function rank(cards: Card[], stats: Stats, { now, recent, exclude }: RankOptions): Card[] {
  return cards
    .filter((c) => !exclude?.has(c.id))
    .map((card) => {
      const stat = stats[card.id];
      let weight = need(stat, now);
      if (recent?.has(card.id) && (stat?.heat ?? 0) < 0.5) weight *= 0.3;
      // Weighted sampling without replacement: the smallest keys win.
      return { card, weight, key: -Math.log(1 - Math.random()) / weight };
    })
    .sort((a, b) => a.key - b.key)
    .map((x) => x.card);
}

/**
 * The first `n` of a ranking, with one refinement: when a chosen card was recently mixed up
 * with another, bring that other card along (in place of the least needed pick), because
 * telling the two apart is exactly the practice that was missing.
 */
export function withMixups(ranked: Card[], n: number, stats: Stats, now: number): Card[] {
  const chosen = ranked.slice(0, n);
  const ids = new Set(chosen.map((c) => c.id));
  let swaps = 0;
  for (const card of [...chosen]) {
    if (swaps >= 2) break;
    const stat = stats[card.id];
    if (!stat?.mix || stat.heat < 1 || ids.has(stat.mix)) continue;
    const partner = ranked.find((c) => c.id === stat.mix);
    if (!partner) continue;
    // Give up the pick that needs showing least, and never one that is hot itself.
    let out = -1;
    for (let i = chosen.length - 1; i >= 0; i--) {
      const s = stats[chosen[i].id];
      if (chosen[i].id === card.id || (s?.heat ?? 0) >= 1) continue;
      if (out < 0 || need(s, now) < need(stats[chosen[out].id], now)) out = i;
    }
    if (out < 0) break;
    ids.delete(chosen[out].id);
    chosen[out] = partner;
    ids.add(partner.id);
    swaps++;
  }
  return chosen;
}

export interface Progress {
  total: number;
  /** Average mastery, 0..1. */
  mastery: number;
  counts: Record<Stage, number>;
  due: number;
  /** Share of all answers that were right, or null before the first answer. */
  accuracy: number | null;
  answers: number;
}

/** A set's learning progress at a moment in time. */
export function progress(cards: Card[], stats: Stats, now: number): Progress {
  const counts: Record<Stage, number> = { new: 0, learning: 0, familiar: 0, mastered: 0 };
  let sum = 0;
  let due = 0;
  let right = 0;
  let wrong = 0;
  for (const c of cards) {
    const stat = stats[c.id];
    counts[stage(stat, now)]++;
    sum += mastery(stat, now);
    if (isDue(stat, now)) due++;
    if (stat) {
      right += stat.right;
      wrong += stat.wrong;
    }
  }
  return {
    total: cards.length,
    mastery: cards.length ? sum / cards.length : 0,
    counts,
    due,
    accuracy: right + wrong ? right / (right + wrong) : null,
    answers: right + wrong,
  };
}

/** The cards giving the most trouble, worst first. */
export function hardest(cards: Card[], stats: Stats, now: number, limit = 5): Card[] {
  return cards
    .filter((c) => (stats[c.id]?.wrong ?? 0) > 0)
    .map((c) => {
      const s = stats[c.id];
      return { c, score: s.heat * 2 + s.wrong / s.seen + (1 - mastery(s, now)) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.c);
}

// ---------- daily activity ----------

export const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Days in a row with any study, counting today (or up to yesterday, so the streak isn't lost before today's session). */
export function streak(activity: Record<string, number>, now: number) {
  let day = new Date(now);
  if (!activity[dayKey(day.getTime())]) day = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1);
  let n = 0;
  while (activity[dayKey(day.getTime())]) {
    n++;
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1);
  }
  return n;
}

/** Answers per day for the last `days` days, oldest first. */
export function lastDays(activity: Record<string, number>, now: number, days = 14) {
  const today = new Date(now);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1 - i));
    return { key: dayKey(d.getTime()), count: activity[dayKey(d.getTime())] ?? 0 };
  });
}
