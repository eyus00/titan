/**
 * Turning pasted text into cards. A list has two separators: one between a term and its
 * definition, and one between cards. Only the FIRST term separator in a card splits it, so
 * definitions may contain commas, dashes and so on.
 */

export type TermSep = 'tab' | 'comma' | 'space' | 'dash' | 'colon' | 'equals' | 'custom';
export type CardSep = 'newline' | 'semicolon' | 'blank' | 'custom';

export interface ParseOptions {
  termSep: TermSep;
  termCustom: string;
  cardSep: CardSep;
  cardCustom: string;
}

export interface ParsedCard {
  term: string;
  def: string;
}

export const DEFAULT_OPTIONS: ParseOptions = { termSep: 'tab', termCustom: '', cardSep: 'newline', cardCustom: '' };

export const TERM_SEPS: { id: TermSep; label: string; sample: string }[] = [
  { id: 'tab', label: 'Tab', sample: '\t' },
  { id: 'comma', label: 'Comma', sample: ', ' },
  { id: 'space', label: 'Space', sample: ' ' },
  { id: 'dash', label: 'Dash', sample: ' - ' },
  { id: 'colon', label: 'Colon', sample: ': ' },
  { id: 'equals', label: 'Equals', sample: ' = ' },
  { id: 'custom', label: 'Custom', sample: '' },
];

export const CARD_SEPS: { id: CardSep; label: string; sample: string }[] = [
  { id: 'newline', label: 'New line', sample: '\n' },
  { id: 'semicolon', label: 'Semicolon', sample: ';\n' },
  { id: 'blank', label: 'Blank line', sample: '\n\n' },
  { id: 'custom', label: 'Custom', sample: '' },
];

/** Custom separators may be typed with \t and \n for tab and new line. */
export const unescape = (s: string) => s.replace(/\\t/g, '\t').replace(/\\n/g, '\n');

/** Where the term ends and the definition starts: [index, length of the separator], or null. */
function findSplit(chunk: string, opts: ParseOptions): [number, number] | null {
  const re = (r: RegExp): [number, number] | null => {
    const m = r.exec(chunk);
    return m ? [m.index, m[0].length] : null;
  };
  switch (opts.termSep) {
    case 'tab':
      return re(/\t+/);
    case 'comma':
      return re(/,/);
    case 'space':
      return re(/\s+/);
    case 'dash':
      // A dash with space around it, or an en/em dash. Plain hyphens stay inside words ("well-known").
      return re(/\s+[-–—]+\s+|\s*[–—]\s*/);
    case 'colon':
      return re(/:/);
    case 'equals':
      return re(/=/);
    case 'custom': {
      const sep = unescape(opts.termCustom);
      if (!sep) return null;
      const i = chunk.indexOf(sep);
      return i < 0 ? null : [i, sep.length];
    }
  }
}

/** "quoted, field" -> quoted, field (spreadsheet exports quote fields that contain the separator). */
function unquote(s: string) {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/""/g, '"').trim();
  return t;
}

/** A leading "quoted term" followed by a comma or tab: returns the two halves, or null. */
function splitQuoted(chunk: string, opts: ParseOptions): ParsedCard | null {
  if ((opts.termSep !== 'comma' && opts.termSep !== 'tab') || !chunk.startsWith('"')) return null;
  const sep = opts.termSep === 'comma' ? ',' : '\t';
  for (let i = 1; i < chunk.length; i++) {
    if (chunk[i] !== '"') continue;
    if (chunk[i + 1] === '"') {
      i++; // escaped quote
      continue;
    }
    const rest = chunk.slice(i + 1);
    if (rest.trimStart().startsWith(sep)) {
      return { term: unquote(chunk.slice(0, i + 1)), def: unquote(rest.trimStart().slice(sep.length)) };
    }
    return null;
  }
  return null;
}

function splitCards(text: string, opts: ParseOptions): string[] {
  const t = text.replace(/\r\n?/g, '\n');
  switch (opts.cardSep) {
    case 'newline':
      return t.split('\n');
    case 'semicolon':
      return t.split(';');
    case 'blank':
      return t.split(/\n[ \t]*\n+/);
    case 'custom': {
      const sep = unescape(opts.cardCustom);
      return sep ? t.split(sep) : [t];
    }
  }
}

/** Every card found in the text. Cards with no term separator come back with an empty definition. */
export function parseList(text: string, opts: ParseOptions): ParsedCard[] {
  const out: ParsedCard[] = [];
  for (const raw of splitCards(text, opts)) {
    const chunk = raw.trim();
    if (!chunk) continue;
    const quoted = splitQuoted(chunk, opts);
    if (quoted) {
      if (quoted.term || quoted.def) out.push(quoted);
      continue;
    }
    const at = findSplit(chunk, opts);
    if (!at) {
      out.push({ term: unquote(chunk), def: '' });
      continue;
    }
    const term = unquote(chunk.slice(0, at[0]));
    const def = unquote(chunk.slice(at[0] + at[1]));
    if (term || def) out.push({ term, def });
  }
  return out;
}

/**
 * Guess the separators from the text itself, so most pastes need no setup. Tries the least
 * ambiguous separators first (a tab rarely appears by accident, a space almost always does).
 */
export function detect(text: string): Pick<ParseOptions, 'termSep' | 'cardSep'> {
  const t = text.replace(/\r\n?/g, '\n').trim();
  if (!t) return { termSep: 'tab', cardSep: 'newline' };

  const lines = t.split('\n').filter((l) => l.trim());
  // One long line with semicolons: "a, b; c, d; e, f"
  const cardSep: CardSep = lines.length === 1 && (t.match(/;/g)?.length ?? 0) >= 2 ? 'semicolon' : 'newline';

  const base: ParseOptions = { ...DEFAULT_OPTIONS, cardSep };
  const sample = (cardSep === 'semicolon' ? t.split(';') : lines).map((l) => l.trim()).filter(Boolean).slice(0, 60);
  /** Share of sample lines this separator splits into two non-empty halves. */
  const share = (termSep: TermSep) => {
    const opts = { ...base, termSep };
    let hits = 0;
    for (const line of sample) {
      const at = findSplit(line, opts);
      if (at && line.slice(0, at[0]).trim() && line.slice(at[0] + at[1]).trim()) hits++;
    }
    return hits / sample.length;
  };

  let best: TermSep = 'tab';
  let bestShare = 0;
  for (const termSep of ['tab', 'dash', 'colon', 'equals', 'comma'] as const) {
    const s = share(termSep);
    if (s >= 0.8) return { termSep, cardSep };
    if (s > bestShare) {
      best = termSep;
      bestShare = s;
    }
  }
  // A space splits nearly any line, so it only wins when nothing else fits half the list.
  if (bestShare < 0.5 && share('space') >= 0.8) return { termSep: 'space', cardSep };
  return { termSep: bestShare > 0 ? best : 'tab', cardSep };
}

/** A sample list in the chosen format, shown as the paste box's placeholder. */
export function placeholder(opts: ParseOptions) {
  const between = opts.termSep === 'custom' ? unescape(opts.termCustom) || ' … ' : TERM_SEPS.find((s) => s.id === opts.termSep)!.sample;
  const after = opts.cardSep === 'custom' ? unescape(opts.cardCustom) || '\n' : CARD_SEPS.find((s) => s.id === opts.cardSep)!.sample;
  return ['Term 1', 'Term 2', 'Term 3'].map((w, i) => `${w}${between}Definition ${i + 1}`).join(after);
}

/** Cards as text, one per line with a tab between the sides (pastes straight into other study tools). */
export function toText(cards: ParsedCard[]) {
  const flat = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();
  return cards.map((c) => `${flat(c.term)}\t${flat(c.def)}`).join('\n');
}
