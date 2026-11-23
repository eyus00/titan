import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Music, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import Button, { btn } from '../components/Button';
import { Choice } from '../components/Controls';
import { sfx, unlockAudio } from '../lib/audio';
import { fitText, textHeight } from '../lib/fit';
import { prepareMusic, startMusic, stopMusic, syncMusic } from '../lib/music';
import { PAIR_CHOICES, actions, isPair, playable, roundSize, useStore, type Card, type StudySet } from '../lib/store';
import { cx, formatDuration, formatTime, plural, shuffle, useTitle } from '../lib/util';
import NotFound from './NotFound';

/** Added to the clock for every wrong pair. */
const PENALTY_MS = 1000;

type Phase = 'ready' | 'playing' | 'done';

interface Tile {
  key: string;
  cardId: string;
  side: 'term' | 'def';
  text: string;
}

interface Result {
  ms: number;
  pairs: number;
  mistakes: number;
  /** Best time before this round, if there was one. */
  previous?: number;
  isBest: boolean;
  /** Cards that were part of a wrong pair. */
  missed: Card[];
}

export default function Match() {
  const { id } = useParams();
  const set = useStore((s) => s.sets.find((x) => x.id === id));
  const cards = useMemo(() => (set ? playable(set) : []), [set]);

  if (!set) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-5 sm:px-8">
        <NotFound what="set" />
      </div>
    );
  }
  if (cards.length < 2) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col items-start justify-center px-5 pb-[12vh] sm:px-8">
        <h1 className="font-serif text-5xl leading-none">Not enough cards yet.</h1>
        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted">A round needs at least two cards with both a term and a definition.</p>
        <Link to={`/set/${set.id}/edit`} className={btn({ variant: 'primary' }) + ' mt-7'}>
          Edit this set
        </Link>
      </div>
    );
  }
  return <Game key={set.id} set={set} cards={cards} />;
}

function Game({ set, cards }: { set: StudySet; cards: Card[] }) {
  const navigate = useNavigate();
  const settings = useStore((s) => s.settings);
  useTitle(set.title);

  const [phase, setPhase] = useState<Phase>('ready');
  /** Counts deals, so a new round's cards animate in afresh. */
  const [round, setRound] = useState(0);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<ReadonlySet<string>>(new Set());
  const [wrong, setWrong] = useState<{ keys: [string, string]; n: number } | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  const pairs = roundSize(cards.length, settings.pairs);
  const best = set.best[pairs];

  /** Card ids still to be dealt, so replaying works through the whole set before repeating. */
  const queue = useRef<string[]>([]);
  const startedAt = useRef(0);
  const penalty = useRef(0);
  const missed = useRef(new Set<string>());
  const clock = useRef<HTMLSpanElement>(null);
  /** The final time, once the last pair is made (the clock stops there while the cards clear). */
  const finalMs = useRef<number | null>(null);
  const doneTimer = useRef(0);

  // Music is rendered ahead of the first round, and always stops when the game is left.
  useEffect(() => {
    prepareMusic();
    return () => {
      window.clearTimeout(doneTimer.current);
      stopMusic(0.25);
    };
  }, []);

  const leave = useCallback(() => navigate(`/set/${set.id}`), [navigate, set.id]);

  // ---------- round ----------

  const start = () => {
    const byId = new Map(cards.map((c) => [c.id, c]));
    let rest = queue.current.filter((cid) => byId.has(cid));
    const picked = rest.splice(0, pairs);
    if (picked.length < pairs) {
      rest = shuffle(cards.map((c) => c.id).filter((cid) => !picked.includes(cid)));
      picked.push(...rest.splice(0, pairs - picked.length));
    }
    queue.current = rest;

    const dealt = shuffle(
      picked.flatMap((cid): Tile[] => {
        const c = byId.get(cid)!;
        return [
          { key: `${cid}:t`, cardId: cid, side: 'term', text: c.term.trim() },
          { key: `${cid}:d`, cardId: cid, side: 'def', text: c.def.trim() },
        ];
      }),
    );

    setTiles(dealt);
    setSelected(null);
    setMatched(new Set());
    setWrong(null);
    setMistakes(0);
    setResult(null);
    setRound((r) => r + 1);
    setPhase('playing');
    penalty.current = 0;
    missed.current = new Set();
    finalMs.current = null;
    startedAt.current = performance.now();

    unlockAudio();
    sfx('start');
    sfx('deal', dealt.length);
    startMusic();
  };

  const finish = () => {
    const ms = performance.now() - startedAt.current + penalty.current;
    finalMs.current = ms;
    const dealtPairs = tiles.length / 2;
    const { previous, isBest } = actions.recordResult(set.id, dealtPairs, ms);
    setResult({
      ms,
      pairs: dealtPairs,
      mistakes: penalty.current / PENALTY_MS,
      previous,
      isBest,
      missed: cards.filter((c) => missed.current.has(c.id)),
    });
    stopMusic(0.7);
    sfx(isBest && previous !== undefined ? 'best' : 'win');
    // Let the last pair finish clearing before the result takes the screen.
    doneTimer.current = window.setTimeout(() => setPhase('done'), 420);
  };

  const pick = (tile: Tile) => {
    if (phase !== 'playing' || finalMs.current !== null || matched.has(tile.key)) return;
    if (selected === null) {
      setSelected(tile.key);
      sfx('tap');
      return;
    }
    if (selected === tile.key) {
      setSelected(null);
      sfx('untap');
      return;
    }
    const other = tiles.find((t) => t.key === selected)!;
    const term = tile.side === 'term' ? tile : other;
    const def = tile.side === 'def' ? tile : other;
    const ok = term.side === 'term' && def.side === 'def' && (term.cardId === def.cardId || isPair(cards, term.text, def.text));
    setSelected(null);

    if (ok) {
      const next = new Set(matched).add(tile.key).add(other.key);
      setMatched(next);
      sfx('match', next.size / 2 - 1);
      if (next.size === tiles.length) finish();
    } else {
      penalty.current += PENALTY_MS;
      missed.current.add(tile.cardId).add(other.cardId);
      setMistakes((m) => m + 1);
      setWrong((w) => ({ keys: [tile.key, other.key], n: (w?.n ?? 0) + 1 }));
      sfx('miss');
      navigator.vibrate?.(35);
    }
  };

  // The red flash on a wrong pair clears itself.
  useEffect(() => {
    if (!wrong) return;
    const t = window.setTimeout(() => setWrong((w) => (w === wrong ? null : w)), 450);
    return () => window.clearTimeout(t);
  }, [wrong]);

  // The clock writes straight to the page every frame (no re-render per tick).
  useLayoutEffect(() => {
    const show = (ms: number) => {
      if (clock.current) clock.current.textContent = formatTime(ms);
    };
    if (phase !== 'playing') return show(result?.ms ?? 0);
    let frame = 0;
    const tick = () => {
      show(finalMs.current ?? performance.now() - startedAt.current + penalty.current);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [phase, result]);

  // Escape leaves the game.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') leave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [leave]);

  const toggle = (patch: { music: boolean } | { sfx: boolean }) => {
    actions.setSettings(patch);
    syncMusic();
  };

  // ---------- pairs choice (ready screen) ----------

  const pairOptions = useMemo(() => {
    const options: { value: number; label: string }[] = PAIR_CHOICES.filter((n) => n <= cards.length).map((n) => ({ value: n, label: String(n) }));
    if (cards.length < PAIR_CHOICES[PAIR_CHOICES.length - 1] && !options.some((o) => o.value === cards.length)) {
      options.push({ value: cards.length, label: `All ${cards.length}` });
    }
    return options;
  }, [cards.length]);

  const choosePairs = (n: number) => {
    // "All 5" is stored as the next standard size up, which still deals all five.
    actions.setSettings({ pairs: PAIR_CHOICES.find((c) => c >= n) ?? n });
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-bg select-none">
      <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-2 sm:px-4" style={{ marginTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-1">
          <button type="button" onClick={leave} aria-label="Leave game" className={btn({ variant: 'ghost', icon: true })}>
            <X className="size-5" strokeWidth={1.75} />
          </button>
          {phase === 'playing' && (
            <span className="label-mono text-muted" aria-label={`${matched.size / 2} of ${tiles.length / 2} pairs matched`}>
              {matched.size / 2}/{tiles.length / 2}
            </span>
          )}
        </div>

        <div className={cx('relative font-mono text-[1.6rem] leading-none tabular-nums', phase === 'done' && 'invisible')} role="timer" aria-label="Time">
          <span ref={clock} />
          {mistakes > 0 && phase === 'playing' && (
            <span key={mistakes} className="penalty label-mono absolute top-1 left-full ml-2 whitespace-nowrap text-bad" aria-hidden>
              +1s
            </span>
          )}
        </div>

        <div className="flex items-center justify-end">
          <button type="button" onClick={() => toggle({ music: !settings.music })} aria-label="Music" aria-pressed={settings.music} title={settings.music ? 'Music on' : 'Music off'} className={btn({ variant: 'ghost', icon: true })}>
            <span className="relative">
              <Music className={cx('size-5', !settings.music && 'opacity-45')} strokeWidth={1.75} />
              {!settings.music && <span className="absolute top-1/2 left-1/2 h-[1.75px] w-6 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-current" />}
            </span>
          </button>
          <button type="button" onClick={() => toggle({ sfx: !settings.sfx })} aria-label="Sound effects" aria-pressed={settings.sfx} title={settings.sfx ? 'Sound effects on' : 'Sound effects off'} className={btn({ variant: 'ghost', icon: true })}>
            {settings.sfx ? <Volume2 className="size-5" strokeWidth={1.75} /> : <VolumeX className="size-5 opacity-60" strokeWidth={1.75} />}
          </button>
        </div>
      </header>

      {phase === 'playing' ? (
        <Board key={round} tiles={tiles} selected={selected} matched={matched} wrong={wrong?.keys} onPick={pick} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {phase === 'ready' ? (
            <div className="rise-in m-auto flex w-full max-w-md flex-col items-center py-6 text-center">
              <p className="label-mono text-muted">match</p>
              <h1 className="mt-2 font-serif text-[clamp(2.4rem,9vw,3.5rem)] leading-none tracking-[-0.01em] break-words">{set.title}</h1>
              <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-pretty text-muted">
                Pick a term, then its definition. Clear the board as fast as you can. A wrong pair costs a second.
              </p>
              {pairOptions.length > 1 && (
                <div className="mt-7 flex flex-col items-center gap-2">
                  <span className="label-mono text-faint">pairs</span>
                  <Choice label="Pairs per round" value={pairs} onChange={choosePairs} options={pairOptions} className="justify-center" />
                </div>
              )}
              <Button variant="primary" size="lg" onClick={start} autoFocus className="mt-8 min-w-40">
                <Play className="size-4 fill-current" />
                Start
              </Button>
              <p className="label-mono mt-4 h-4 text-faint">{best !== undefined && <>best {formatDuration(best)}</>}</p>
            </div>
          ) : (
            result && <Summary result={result} onAgain={start} onLeave={leave} />
          )}
        </div>
      )}
    </div>
  );
}

// ---------- the board ----------

const MIN_CELL_W = 130;
const MIN_CELL_H = 64;
const MAX_CELL_W = 380;
const MAX_CELL_H = 250;
/** Cards read best a little wider than tall. */
const TARGET_RATIO = 1.7;
/** Below this font size (px) the board stops using even rows and gives long cards more height. */
const COMFORT = 15;
/** The card's border, both sides. */
const FRAME = 2;

/** Columns and cell size for n cards in a W x H area: the grid whose cells are closest to the target shape. */
function chooseGrid(n: number, W: number, H: number, gap: number) {
  let best = { cols: 1, cellW: Math.min(W, MAX_CELL_W), cellH: MIN_CELL_H, score: -Infinity };
  for (let cols = 1; cols <= Math.min(n, 6); cols++) {
    const rows = Math.ceil(n / cols);
    const rawW = (W - gap * (cols - 1)) / cols;
    if (cols > 1 && rawW < MIN_CELL_W) break;
    const cellW = Math.min(rawW, MAX_CELL_W);
    const cellH = Math.min(Math.max((H - gap * (rows - 1)) / rows, MIN_CELL_H), MAX_CELL_H);
    let score = -Math.abs(Math.log(cellW / cellH / TARGET_RATIO));
    if (n % cols) score -= 0.4; // a ragged last row
    if (cols === 1) score -= 0.5;
    if (score > best.score) best = { cols, cellW, cellH, score };
  }
  return best;
}

interface Plan {
  cols: number;
  cellW: number;
  gap: number;
  padX: number;
  padY: number;
  /** Height of each row. Rows still grow if a card needs more. */
  rows: number[];
  /** Font size of each card. */
  sizes: number[];
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/**
 * Lays the cards out so that all of every card's text shows, as large as possible.
 * Even rows when that keeps everything comfortably readable. Otherwise rows with long
 * definitions take height from rows that only hold short terms, and if the screen still
 * can't hold it all at the smallest size, the board scrolls rather than cutting text off.
 */
function planBoard(tiles: Tile[], W: number, H: number): Plan {
  const gap = W < 520 ? 8 : 12;
  const { cols, cellW, cellH } = chooseGrid(tiles.length, W, H, gap);
  const padX = cellW < 200 ? 10 : 16;
  const padY = cellH < 110 ? 8 : 12;
  const innerW = cellW - padX * 2 - FRAME;
  const chrome = padY * 2 + FRAME;
  const min = cellW < 200 ? 11 : 12;
  const max = Math.min(26, Math.max(15, cellH * 0.22));
  const rowCount = Math.ceil(tiles.length / cols);
  const base = { cols, cellW, gap, padX, padY };

  const even = tiles.map((t) => fitText(t.text, innerW, cellH - chrome, min, max));
  if (even.every((f) => f.fits && f.size >= Math.min(COMFORT, max))) {
    return { ...base, rows: Array<number>(rowCount).fill(cellH), sizes: even.map((f) => f.size) };
  }

  /** Row heights needed to show every card at one font size. */
  const need = (size: number) => {
    const rows = Array<number>(rowCount).fill(MIN_CELL_H);
    tiles.forEach((t, i) => {
      const r = Math.floor(i / cols);
      rows[r] = Math.max(rows[r], textHeight(t.text, innerW, size) + chrome);
    });
    return rows;
  };

  const room = Math.min(H - gap * (rowCount - 1), rowCount * MAX_CELL_H);
  let rows = need(min);
  if (sum(rows) < room) {
    // The largest size (in half pixels) at which every row still fits on screen.
    let lo = Math.round(min * 2);
    let hi = Math.round(max * 2);
    if (sum(need(hi / 2)) <= room) lo = hi;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (sum(need(mid / 2)) <= room) lo = mid;
      else hi = mid;
    }
    rows = need(lo / 2);
    const spare = (room - sum(rows)) / rowCount;
    rows = rows.map((h) => h + spare);
  }
  const sizes = tiles.map((t, i) => fitText(t.text, innerW, rows[Math.floor(i / cols)] - chrome, min, max).size);
  return { ...base, rows, sizes };
}

function Board({
  tiles,
  selected,
  matched,
  wrong,
  onPick,
}: {
  tiles: Tile[];
  selected: string | null;
  matched: ReadonlySet<string>;
  wrong?: [string, string];
  onPick: (tile: Tile) => void;
}) {
  const area = useRef<HTMLDivElement>(null);
  const [plan, setPlan] = useState<Plan | null>(null);

  // Measure the free area, plan the board for it, and plan again whenever it changes size.
  useLayoutEffect(() => {
    const el = area.current!;
    let last = '';
    const measure = () => {
      const style = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const h = el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      if (w <= 0 || h <= 0 || `${w}x${h}` === last) return;
      last = `${w}x${h}`;
      setPlan(planBoard(tiles, w, h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tiles]);

  return (
    <div ref={area} className="flex min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
      {plan && (
        <div
          className="m-auto grid"
          style={{
            gap: plan.gap,
            gridTemplateColumns: `repeat(${plan.cols}, ${plan.cellW}px)`,
            gridTemplateRows: plan.rows.map((h) => `minmax(${h}px, auto)`).join(' '),
          }}
        >
          {tiles.map((tile, i) => {
            const isMatched = matched.has(tile.key);
            const isSelected = selected === tile.key;
            const isWrong = !!wrong?.includes(tile.key);
            return (
              // The wrapper carries the deal-in animation, so state changes on the button never replay it.
              <div key={tile.key} className="tile-in flex" style={{ animationDelay: `${i * 26}ms` }}>
                <button
                  type="button"
                  disabled={isMatched}
                  aria-pressed={isSelected}
                  onClick={() => onPick(tile)}
                  style={{ padding: `${plan.padY}px ${plan.padX}px`, fontSize: plan.sizes[i] }}
                  className={cx(
                    'flex w-full touch-manipulation items-center justify-center rounded-2xl border text-center transition-[background-color,border-color,color,transform] duration-100 ease-out',
                    isMatched
                      ? 'tile-matched border-ok bg-ok/10 text-fg'
                      : isWrong
                        ? 'tile-wrong border-bad bg-bad/10 text-fg'
                        : isSelected
                          ? 'scale-[1.025] border-fg bg-fg text-bg'
                          : 'border-line bg-surface text-fg hover:border-fg/35 active:scale-[0.98]',
                  )}
                >
                  <span className="card-text">{tile.text}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- after the round ----------

function Summary({ result, onAgain, onLeave }: { result: Result; onAgain: () => void; onLeave: () => void }) {
  const beat = result.isBest && result.previous !== undefined;
  return (
    <div className="rise-in m-auto flex w-full max-w-md flex-col items-center py-6 text-center">
      <p className={cx('label-mono', beat ? 'text-ok' : 'text-muted')}>{beat ? 'new best' : 'cleared'}</p>
      <p className="mt-1 font-serif text-[clamp(4.5rem,22vw,7rem)] leading-none tracking-[-0.02em] tabular-nums">
        {formatTime(result.ms)}
        {result.ms < 60_000 && <span className="ml-1 text-[0.35em] tracking-normal text-muted">s</span>}
      </p>
      <p className="label-mono mt-3 text-muted">
        {plural(result.pairs, 'pair')} · {result.mistakes ? plural(result.mistakes, 'mistake') : 'no mistakes'}
        {result.previous !== undefined && (
          <>
            {' '}
            · {beat ? 'was' : 'best'} {formatDuration(result.previous)}
          </>
        )}
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-2.5">
        <Button variant="primary" size="lg" onClick={onAgain} autoFocus>
          <RotateCcw className="size-4" />
          Play again
        </Button>
        <Button size="lg" onClick={onLeave}>
          Done
        </Button>
      </div>

      {result.missed.length > 0 && (
        <div className="mt-10 w-full text-left select-text">
          <p className="label-mono mb-2 text-muted">worth another look</p>
          <ul className="overflow-hidden rounded-2xl border border-line">
            {result.missed.map((c) => (
              <li key={c.id} className="border-b border-line px-4 py-3 last:border-b-0">
                <p className="text-[15px] leading-snug break-words">{c.term}</p>
                <p className="mt-0.5 text-sm leading-snug break-words whitespace-pre-line text-muted">{c.def}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
