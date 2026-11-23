import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AnimatePresence, m } from 'motion/react';
import Button, { btn } from '../components/Button';
import { Choice } from '../components/Controls';
import Icon from '../components/Icon';
import Kbd from '../components/Kbd';
import { Count, Ring } from '../components/Ring';
import Shortcuts from '../components/Shortcuts';
import { sfx, unlockAudio } from '../lib/audio';
import { chooseGrid, packOrder, planBoard } from '../lib/board';
import { useHotkeys, usingKeyboard } from '../lib/hotkeys';
import { progress, rank, withMixups } from '../lib/learn';
import { prepareMusic, startMusic, stopMusic, syncMusic } from '../lib/music';
import { useProximity } from '../lib/proximity';
import { PAIR_CHOICES, actions, getState, isPair, playable, useStore, type Card, type StudySet } from '../lib/store';
import { cx, formatClock, formatDuration, formatTime, plural, shuffle, useGameScreen, useTitle } from '../lib/util';
import NotFound from './NotFound';

/** Added to the clock for every wrong pair in a timed round. */
const PENALTY_MS = 1000;

type Phase = 'ready' | 'playing' | 'done';

interface Tile {
  key: string;
  cardId: string;
  side: 'term' | 'def';
  text: string;
}

interface Box {
  w: number;
  h: number;
}

interface Result {
  endless: boolean;
  ms: number;
  pairs: number;
  boards: number;
  mistakes: number;
  /** Best time before this round, if there was one (timed rounds only). */
  previous?: number;
  isBest: boolean;
  /** Cards that were part of a wrong pair. */
  missed: Card[];
  /** The set's mastery before and after, 0..1. */
  before: number;
  after: number;
}

const tilesOf = (cards: Card[]): Tile[] =>
  cards.flatMap((c): Tile[] => [
    { key: `${c.id}:t`, cardId: c.id, side: 'term', text: c.term.trim() },
    { key: `${c.id}:d`, cardId: c.id, side: 'def', text: c.def.trim() },
  ]);

const length = (c: Card) => Math.max(c.term.length, c.def.length);

/**
 * A fitting order for these cards' tiles on a board of this size, or null when they are too much
 * for it. A plain shuffle if that fits; otherwise the tightest packing (similar lengths share a row).
 */
function arrange(cards: Card[], box: Box, shuffles = 4): Tile[] | null {
  const all = tilesOf(cards);
  for (let i = 0; i < shuffles; i++) {
    const order = shuffle(all);
    if (planBoard(order.map((t) => t.text), box.w, box.h).fits) return order;
  }
  const order = packOrder(all, (t) => t.text, box.w, box.h);
  return planBoard(order.map((t) => t.text), box.w, box.h).fits ? order : null;
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
      <div className="page mx-auto flex min-h-dvh max-w-3xl flex-col items-start justify-center px-5 pb-[12vh] sm:px-8">
        <h1 className="font-serif text-5xl leading-none text-balance">Not enough cards yet.</h1>
        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-pretty text-muted">A round needs at least two cards with both a term and a definition.</p>
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
  useGameScreen();

  const [phase, setPhase] = useState<Phase>('ready');
  /** Counts deals, so each new board's cards animate in afresh. */
  const [deal, setDeal] = useState(0);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<ReadonlySet<string>>(new Set());
  const [wrong, setWrong] = useState<{ keys: [string, string]; n: number } | null>(null);
  /** This session so far: pairs made and wrong pairs (across boards when endless). */
  const [made, setMade] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  /** Everything about the running session that the screen doesn't need to re-render for. */
  const run = useRef({
    endless: false,
    startedAt: 0,
    penalty: 0,
    boards: 0,
    made: 0,
    mistakes: 0,
    /** Cards missed at any point this session, and on the current board. */
    missed: new Set<string>(),
    boardMissed: new Set<string>(),
    /** Cards on the previous board, held back from the next one. */
    recent: new Set<string>(),
    before: 0,
    /** The final time, once play has stopped (the clock holds there). */
    frozen: null as number | null,
    timer: 0,
  });
  const clock = useRef<HTMLSpanElement>(null);

  // ---------- the free area for the board ----------

  const area = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const measure = useCallback((): Box | null => {
    const el = area.current;
    if (!el) return null;
    const style = getComputedStyle(el);
    const w = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const h = el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    return w > 0 && h > 0 ? { w, h } : null;
  }, []);
  useLayoutEffect(() => {
    const update = () => {
      const next = measure();
      setBox((b) => (next && b && b.w === next.w && b.h === next.h ? b : next));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(area.current!);
    return () => ro.disconnect();
  }, [measure]);

  // How many pairs of this set this screen can hold at all (judged on the shortest cards).
  const [maxFit, setMaxFit] = useState(Infinity);
  useLayoutEffect(() => {
    if (!box || phase !== 'ready') return;
    const shortest = [...cards].sort((a, b) => length(a) - length(b));
    let fit = 2;
    for (let n = Math.min(shortest.length, PAIR_CHOICES[PAIR_CHOICES.length - 1]); n > 2; n--) {
      if (arrange(shortest.slice(0, n), box, 0)) {
        fit = n;
        break;
      }
    }
    setMaxFit(fit);
    // The cards only change when the set is edited, which can't happen from this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box, phase, set.updatedAt]);

  // The board sizes on offer: the standard ones this set and this screen can hold, plus
  // "all" for a set smaller than the largest board.
  const pairOptions = useMemo(() => {
    const off = (n: number) => ({ disabled: n > maxFit, title: n > maxFit ? "Doesn't fit this screen" : undefined });
    const options = PAIR_CHOICES.filter((n) => n <= cards.length).map((n) => ({ value: n as number, label: String(n), ...off(n) }));
    if (cards.length < PAIR_CHOICES[PAIR_CHOICES.length - 1] && !options.some((o) => o.value === cards.length)) {
      options.push({ value: cards.length, label: `All ${cards.length}`, ...off(cards.length) });
    }
    return options.sort((x, y) => x.value - y.value);
  }, [cards.length, maxFit]);
  const usable = pairOptions.filter((o) => !o.disabled);
  /** Pairs on the next board: the setting, brought down to what this set and screen allow. */
  const pairs = usable.length
    ? (usable.filter((o) => o.value <= settings.pairs).pop() ?? usable[0]).value
    : Math.max(2, Math.min(settings.pairs, cards.length, maxFit));
  const best = set.best[pairs];

  // Music is made ready ahead of the first round, and always stops when the game is left.
  useEffect(() => {
    prepareMusic();
    const r = run.current;
    return () => {
      window.clearTimeout(r.timer);
      stopMusic(0.25);
    };
  }, []);

  const leave = useCallback(() => navigate(`/set/${set.id}`), [navigate, set.id]);

  // ---------- dealing ----------

  /**
   * The next board: the cards that most need practice (lib/learn.ts), as many as were asked for,
   * in an order that fits this screen. The board never scrolls, so when the chosen cards are too
   * much for the screen, the longest are swapped for shorter ones. The one card that needs
   * practice most always stays: if it is very long, the board gets smaller around it instead,
   * so long cards still get their turn.
   */
  const pick = (wanted: number): Tile[] => {
    const b = measure() ?? box ?? { w: 320, h: 480 };
    const stats = getState().sets.find((s) => s.id === set.id)?.stats ?? {};
    const now = Date.now();
    const ranked = rank(cards, stats, { now, recent: run.current.recent });
    const must = ranked[0];
    for (let n = Math.min(wanted, ranked.length); n >= 2; n--) {
      let chosen = withMixups(ranked, n, stats, now);
      for (;;) {
        const order = arrange(chosen, b);
        if (order) return order;
        const longest = chosen.filter((c) => c !== must).reduce((a, c) => (length(c) > length(a) ? c : a));
        const shorter = ranked.find((c) => !chosen.includes(c) && length(c) < length(longest));
        if (!shorter) break;
        chosen = chosen.map((c) => (c === longest ? shorter : c));
      }
    }
    // Even alone with the shortest card it is a squeeze: deal those two and let the text shrink.
    const other = ranked.filter((c) => c !== must).reduce((a, c) => (length(c) < length(a) ? c : a));
    return packOrder(tilesOf([must, other]), (t) => t.text, b.w, b.h);
  };

  const dealBoard = () => {
    const next = pick(pairs);
    run.current.boardMissed = new Set();
    run.current.recent = new Set(next.map((t) => t.cardId));
    setTiles(next);
    setSelected(null);
    setMatched(new Set());
    setWrong(null);
    setDeal((d) => d + 1);
    sfx('deal', next.length);
  };

  const start = () => {
    const now = Date.now();
    Object.assign(run.current, {
      endless: settings.endless,
      startedAt: performance.now(),
      penalty: 0,
      boards: 0,
      made: 0,
      mistakes: 0,
      missed: new Set<string>(),
      recent: new Set<string>(),
      before: progress(cards, set.stats, now).mastery,
      frozen: null,
    });
    setMade(0);
    setMistakes(0);
    setResult(null);
    setPhase('playing');
    unlockAudio();
    sfx('start');
    dealBoard();
    startMusic();
  };

  const elapsed = () => performance.now() - run.current.startedAt + run.current.penalty;

  /** The session is over: a timed round was cleared, or an endless run was stopped. */
  const finish = (record?: { previous: number | undefined; isBest: boolean }) => {
    const r = run.current;
    window.clearTimeout(r.timer);
    const ms = elapsed();
    r.frozen = ms;
    const stats = getState().sets.find((s) => s.id === set.id)?.stats ?? {};
    setResult({
      endless: r.endless,
      ms,
      pairs: r.made,
      boards: r.boards,
      mistakes: r.mistakes,
      previous: record?.previous,
      isBest: record?.isBest ?? false,
      missed: cards.filter((c) => r.missed.has(c.id)),
      before: r.before,
      after: progress(cards, stats, Date.now()).mastery,
    });
    stopMusic(0.7);
    sfx(record?.isBest && record.previous !== undefined ? 'best' : 'win');
    // Let the last pair finish clearing before the result takes the screen.
    r.timer = window.setTimeout(() => setPhase('done'), 420);
  };

  /** Stop an endless run. */
  const stop = () => {
    if (run.current.frozen !== null) return;
    if (!run.current.made) {
      stopMusic(0.3);
      setPhase('ready');
      return;
    }
    finish();
  };

  const onPick = (tile: Tile) => {
    const r = run.current;
    if (phase !== 'playing' || r.frozen !== null || matched.has(tile.key)) return;
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

    if (!ok) {
      // Each card counts as missed once per board, the first time it is part of a wrong pair.
      const fresh = [tile, other].filter((t) => !r.boardMissed.has(t.cardId));
      actions.answer(
        set.id,
        [...new Set(fresh.map((t) => t.cardId))].map((cid) => ({ id: cid, correct: false, mixedWith: cid === tile.cardId ? other.cardId : tile.cardId })),
      );
      for (const t of [tile, other]) {
        r.boardMissed.add(t.cardId);
        r.missed.add(t.cardId);
      }
      r.mistakes++;
      if (!r.endless) r.penalty += PENALTY_MS;
      setMistakes(r.mistakes);
      setWrong((w) => ({ keys: [tile.key, other.key], n: (w?.n ?? 0) + 1 }));
      sfx('miss');
      navigator.vibrate?.(35);
      return;
    }

    const next = new Set(matched).add(tile.key).add(other.key);
    setMatched(next);
    r.made++;
    setMade(r.made);
    sfx('match', next.size / 2 - 1);
    // A card is learned a little more when both of its halves are matched without a miss.
    const clean = [...new Set([tile.cardId, other.cardId])].filter((cid) => next.has(`${cid}:t`) && next.has(`${cid}:d`) && !r.boardMissed.has(cid));
    actions.answer(set.id, clean.map((cid) => ({ id: cid, correct: true })));

    if (next.size < tiles.length) return;
    r.boards++;
    if (r.endless) {
      actions.recordBoard(set.id, tiles.length / 2);
      r.timer = window.setTimeout(dealBoard, 520);
    } else {
      finish(actions.recordBoard(set.id, tiles.length / 2, elapsed()));
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
      if (clock.current) clock.current.textContent = run.current.endless ? formatClock(ms) : formatTime(ms);
    };
    if (phase !== 'playing') return show(result?.ms ?? 0);
    let frame = 0;
    const tick = () => {
      show(run.current.frozen ?? elapsed());
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [phase, result]);

  const toggle = (patch: { music: boolean } | { sfx: boolean }) => {
    actions.setSettings(patch);
    syncMusic();
  };

  // ---------- options (ready screen) ----------

  // "All 5" is stored as the next standard size up, which still deals all five here
  // and doesn't shrink the boards of bigger sets.
  const choosePairs = (n: number) => actions.setSettings({ pairs: PAIR_CHOICES.find((c) => c >= n) ?? n });
  const stepPairs = (dir: 1 | -1) => {
    const next = usable[usable.findIndex((o) => o.value === pairs) + dir];
    if (next) choosePairs(next.value);
  };

  useHotkeys('Match', [
    { keys: ['Escape'], label: selected ? 'Put the card down' : run.current.endless && phase === 'playing' ? 'Stop' : 'Leave the game', run: () => (phase === 'playing' && selected ? setSelected(null) : phase === 'playing' && run.current.endless ? stop() : leave()) },
    { keys: ['m'], label: 'Music on or off', run: () => toggle({ music: !settings.music }) },
    { keys: ['n'], label: 'Sound effects on or off', run: () => toggle({ sfx: !settings.sfx }) },
    { keys: ['Enter', ' '], label: phase === 'done' ? 'Play again' : 'Start', when: phase !== 'playing', run: start },
    { keys: ['ArrowLeft', 'a'], label: 'Fewer pairs', when: phase === 'ready', run: () => stepPairs(-1) },
    { keys: ['ArrowRight', 'd'], label: 'More pairs', when: phase === 'ready', run: () => stepPairs(1) },
    { keys: ['e'], label: 'Endless on or off', when: phase === 'ready', run: () => actions.setSettings({ endless: !settings.endless }) },
  ]);

  const playing = phase === 'playing';
  const grid = box ? chooseGrid(pairs * 2, box.w, box.h) : null;

  return (
    <div className="fixed inset-0 flex touch-manipulation flex-col overflow-hidden overscroll-none bg-bg select-none">
      <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-2 sm:px-4" style={{ marginTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-1.5">
          {playing && run.current.endless ? (
            <Button size="sm" onClick={stop} className="ml-1">
              <Icon name="stop" size={12} />
              Stop
              <Kbd>Esc</Kbd>
            </Button>
          ) : (
            <button type="button" onClick={leave} aria-label="Leave game" className={btn({ variant: 'ghost', icon: true })}>
              <Icon name="close" size={20} />
            </button>
          )}
          {playing && (
            <span className="label-mono text-muted tabular-nums" aria-live="off">
              {run.current.endless ? plural(made, 'pair') : `${matched.size / 2}/${tiles.length / 2}`}
            </span>
          )}
        </div>

        <div className={cx('relative font-mono text-[1.6rem] leading-none tabular-nums', phase === 'done' && 'invisible')} role="timer" aria-label="Time">
          <span ref={clock} />
          {mistakes > 0 && playing && !run.current.endless && (
            <span key={mistakes} className="penalty label-mono absolute top-1 left-full ml-2 whitespace-nowrap text-bad" aria-hidden>
              +1s
            </span>
          )}
        </div>

        <div className="flex items-center justify-end">
          <IconToggle on={settings.music} label="Music" hint="M" icon={settings.music ? 'music' : 'musicOff'} onClick={() => toggle({ music: !settings.music })} />
          <IconToggle on={settings.sfx} label="Sound effects" hint="N" icon={settings.sfx ? 'sound' : 'soundOff'} onClick={() => toggle({ sfx: !settings.sfx })} />
        </div>
      </header>

      {/* The board's area. It is always here (also behind the start and result screens) so its size is known before dealing. */}
      <div ref={area} className="relative min-h-0 flex-1 overflow-hidden px-3 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
        {playing && box && <Board key={deal} tiles={tiles} box={box} selected={selected} matched={matched} wrong={wrong?.keys} onPick={onPick} />}

        {!playing && (
          <div className="absolute inset-0 flex touch-pan-y flex-col overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {phase === 'ready' ? (
              <div className="m-auto flex w-full max-w-md flex-col items-center py-6 text-center">
                <p className="enter label-mono text-muted">match</p>
                <h1 className="enter mt-2 font-serif text-[clamp(2.4rem,9vw,3.5rem)] leading-none tracking-[-0.01em] text-balance break-words">{set.title}</h1>

                <div className="enter mt-8 flex flex-col items-center gap-3" style={{ '--i': 1 } as CSSProperties}>
                  <GridPreview cols={grid?.cols ?? 4} rows={grid?.rows ?? 4} count={pairs * 2} ratio={box ? box.w / box.h : 1.6} />
                  <p className="label-mono text-muted">
                    {grid ? `${grid.cols} × ${grid.rows}` : ''} · {pairs * 2} cards
                  </p>
                  {pairOptions.length > 1 && (
                    <div className="flex items-center gap-2">
                      <Kbd>←</Kbd>
                      <Choice label="Pairs per board" value={pairs} onChange={choosePairs} options={pairOptions} className="justify-center" />
                      <Kbd>→</Kbd>
                    </div>
                  )}
                  {maxFit < Math.min(cards.length, PAIR_CHOICES[PAIR_CHOICES.length - 1]) && (
                    <p className="max-w-xs text-[13px] text-pretty text-faint">Bigger boards won’t fit this screen with these definitions, so they’re off.</p>
                  )}
                </div>

                <div className="enter mt-6 flex flex-col items-center gap-2.5" style={{ '--i': 2 } as CSSProperties}>
                  <Choice
                    label="Mode"
                    value={settings.endless ? 'endless' : 'round'}
                    onChange={(v) => actions.setSettings({ endless: v === 'endless' })}
                    options={[
                      { value: 'round', label: <><Icon name="flag" size={14} stroke={2} />Timed round</> },
                      { value: 'endless', label: <><Icon name="endless" size={14} stroke={2} />Endless<Kbd on={settings.endless} className="ml-0.5">E</Kbd></> },
                    ]}
                  />
                  <p className="max-w-xs text-[14px] leading-relaxed text-pretty text-muted">
                    {settings.endless
                      ? 'Boards keep coming until you stop. The terms you miss come back more often.'
                      : 'Clear the board as fast as you can. A wrong pair costs a second.'}
                  </p>
                </div>

                <div className="enter mt-7 flex flex-col items-center" style={{ '--i': 3 } as CSSProperties}>
                  <Button variant="primary" size="lg" onClick={start} autoFocus className="min-w-44">
                    <Icon name="play" size={16} />
                    Start
                    <Kbd on>↵</Kbd>
                  </Button>
                  <p className="label-mono mt-4 h-4 text-faint">{!settings.endless && best !== undefined && <>best {formatDuration(best)}</>}</p>
                </div>
              </div>
            ) : (
              result && <Summary result={result} onAgain={start} onLeave={leave} />
            )}
          </div>
        )}
      </div>

      {/* Keyboard cues, only where there is a keyboard. */}
      <footer className={cx('label-mono hidden h-9 shrink-0 items-center justify-center gap-5 pb-2 text-faint keys:flex', !playing && 'invisible')} aria-hidden>
        <span className="flex items-center gap-1.5">
          <Kbd>W</Kbd>
          <Kbd>A</Kbd>
          <Kbd>S</Kbd>
          <Kbd>D</Kbd>
          move
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd>
          pick
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Esc</Kbd>
          {selected ? 'put down' : run.current.endless ? 'stop' : 'leave'}
        </span>
      </footer>
      <Shortcuts />
    </div>
  );
}

function IconToggle({ on, label, hint, icon, onClick }: { on: boolean; label: string; hint: string; icon: 'music' | 'musicOff' | 'sound' | 'soundOff'; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={on} title={`${label} ${on ? 'on' : 'off'} (${hint})`} className={btn({ variant: 'ghost', icon: true })}>
      {/* The two states cross-fade in place. */}
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={icon}
          initial={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
          transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
          className="flex"
        >
          <Icon name={icon} size={20} />
        </m.span>
      </AnimatePresence>
    </button>
  );
}

/** A small picture of the board about to be dealt: the same grid, in the shape of this screen. */
function GridPreview({ cols, rows, count, ratio }: { cols: number; rows: number; count: number; ratio: number }) {
  // Fit a box of the screen's proportions inside 190 x 120.
  const r = Math.min(2.4, Math.max(0.55, ratio));
  const w = Math.min(190, 120 * r);
  const h = w / r;
  return (
    <div className="flex h-[120px] items-center justify-center" aria-hidden>
      <div className="grid gap-[3px]" style={{ width: w, height: h, gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
        <AnimatePresence initial={false} mode="popLayout">
          {Array.from({ length: count }, (_, i) => (
            <m.span
              key={i}
              layout
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
              className="rounded-[4px] border border-fg/25 bg-fg/[0.07]"
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------- the board ----------

function Board({
  tiles,
  box,
  selected,
  matched,
  wrong,
  onPick,
}: {
  tiles: Tile[];
  box: Box;
  selected: string | null;
  matched: ReadonlySet<string>;
  wrong?: [string, string];
  onPick: (tile: Tile) => void;
}) {
  // Reads sizes from a hidden measuring element; the same input always gives the same plan.
  const plan = useMemo(() => planBoard(tiles.map((t) => t.text), box.w, box.h), [tiles, box]);
  const grid = useProximity<HTMLDivElement>(Math.max(160, plan.cellW * 0.8));
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  /** Where the keyboard is on the board. */
  const [cursor, setCursor] = useState(0);

  const focus = (i: number) => {
    setCursor(i);
    buttons.current[i]?.focus({ preventScroll: true });
  };

  // Someone playing on the keyboard starts with the cursor on the first card. After a tap or
  // click nothing is focused (no stray ring), and the first key press picks the cursor up.
  useEffect(() => {
    if (usingKeyboard()) buttons.current[0]?.focus({ preventScroll: true });
  }, []);

  // When the card under the cursor is cleared, the cursor moves to the nearest one left.
  useEffect(() => {
    if (!tiles[cursor] || !matched.has(tiles[cursor].key)) return;
    const active = document.activeElement;
    if (active && active !== document.body && !grid.current?.contains(active)) return;
    const row = Math.floor(cursor / plan.cols);
    const col = cursor % plan.cols;
    let nearest = -1;
    let dist = Infinity;
    tiles.forEach((t, i) => {
      if (matched.has(t.key)) return;
      const d = Math.abs(Math.floor(i / plan.cols) - row) + Math.abs((i % plan.cols) - col);
      if (d < dist) {
        dist = d;
        nearest = i;
      }
    });
    if (nearest >= 0) focus(nearest);
    // Runs when cards clear; the cursor itself is read, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched]);

  /** Step the cursor one card in a direction, skipping cleared cards. */
  const move = (dx: number, dy: number) => {
    const open = (i: number) => i >= 0 && i < tiles.length && !matched.has(tiles[i].key);
    const row = Math.floor(cursor / plan.cols);
    const col = cursor % plan.cols;
    // Straight ahead first.
    for (let r = row + dy, c = col + dx; r >= 0 && c >= 0 && c < plan.cols && r * plan.cols + c < tiles.length; r += dy, c += dx) {
      if (open(r * plan.cols + c)) {
        sfx('move');
        return focus(r * plan.cols + c);
      }
    }
    // Otherwise the nearest open card anywhere on that side.
    let nearest = -1;
    let dist = Infinity;
    tiles.forEach((_, i) => {
      if (!open(i)) return;
      const ahead = dx ? ((i % plan.cols) - col) * dx : (Math.floor(i / plan.cols) - row) * dy;
      if (ahead <= 0) return;
      const aside = dx ? Math.abs(Math.floor(i / plan.cols) - row) : Math.abs((i % plan.cols) - col);
      const d = ahead + aside * 2;
      if (d < dist) {
        dist = d;
        nearest = i;
      }
    });
    if (nearest >= 0) {
      sfx('move');
      focus(nearest);
    }
  };

  /** Enter and Space pick the card under the cursor, even after the mouse took focus away. */
  const pickAtCursor = () => {
    const tile = tiles[cursor];
    if (!tile || matched.has(tile.key)) return;
    buttons.current[cursor]?.focus({ preventScroll: true });
    onPick(tile);
  };

  useHotkeys('Board', [
    { keys: ['w', 'ArrowUp'], label: 'Move up', run: () => move(0, -1) },
    { keys: ['s', 'ArrowDown'], label: 'Move down', run: () => move(0, 1) },
    { keys: ['a', 'ArrowLeft'], label: 'Move left', run: () => move(-1, 0) },
    { keys: ['d', 'ArrowRight'], label: 'Move right', run: () => move(1, 0) },
    { keys: ['Enter', ' '], label: 'Pick the card', run: pickAtCursor },
  ]);

  return (
    <div className="flex h-full items-center justify-center">
      <div
        ref={grid}
        className="grid"
        style={{
          gap: plan.gap,
          gridTemplateColumns: `repeat(${plan.cols}, ${plan.cellW}px)`,
          gridTemplateRows: plan.rows.map((h) => `${h}px`).join(' '),
        }}
      >
        {tiles.map((tile, i) => {
          const isMatched = matched.has(tile.key);
          const isWrong = !!wrong?.includes(tile.key);
          return (
            // The wrapper carries the deal-in animation, so state changes on the card never replay it.
            <div key={tile.key} className="tile-in flex min-h-0 min-w-0" style={{ '--i': i } as CSSProperties}>
              <button
                ref={(el) => {
                  buttons.current[i] = el;
                }}
                type="button"
                disabled={isMatched}
                aria-pressed={selected === tile.key}
                tabIndex={i === cursor ? 0 : -1}
                onClick={() => onPick(tile)}
                onFocus={() => setCursor(i)}
                style={{ padding: `${plan.padY}px ${plan.padX}px`, fontSize: plan.sizes[i] }}
                className={cx(
                  'tile near flex min-h-0 w-full items-center justify-center rounded-2xl text-center',
                  isMatched && 'tile-matched',
                  isWrong && 'tile-wrong tile-shake',
                )}
              >
                <span className="card-text max-h-full overflow-hidden">{tile.text}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- after the round ----------

function Summary({ result, onAgain, onLeave }: { result: Result; onAgain: () => void; onLeave: () => void }) {
  const beat = result.isBest && result.previous !== undefined;
  const accuracy = result.pairs + result.mistakes ? result.pairs / (result.pairs + result.mistakes) : 1;
  const gained = Math.round((result.after - result.before) * 100);
  return (
    <div className="m-auto flex w-full max-w-md flex-col items-center py-6 text-center">
      <p className={cx('enter label-mono', beat ? 'text-ok' : 'text-muted')}>{result.endless ? 'run stopped' : beat ? 'new best' : 'cleared'}</p>
      <p className="enter mt-1 font-serif text-[clamp(4.5rem,22vw,7rem)] leading-none tracking-[-0.02em] tabular-nums">
        {result.endless ? (
          <>
            {result.pairs}
            <span className="ml-2 text-[0.3em] tracking-normal text-muted">{result.pairs === 1 ? 'pair' : 'pairs'}</span>
          </>
        ) : (
          <>
            {formatTime(result.ms)}
            {result.ms < 60_000 && <span className="ml-1 text-[0.35em] tracking-normal text-muted">s</span>}
          </>
        )}
      </p>
      <p className="enter label-mono mt-3 text-muted" style={{ '--i': 1 } as CSSProperties}>
        {result.endless ? (
          <>
            {plural(result.boards, 'board')} · {formatClock(result.ms)} · {result.mistakes ? plural(result.mistakes, 'mistake') : 'no mistakes'}
          </>
        ) : (
          <>
            {plural(result.pairs, 'pair')} · {result.mistakes ? plural(result.mistakes, 'mistake') : 'no mistakes'}
            {result.previous !== undefined && (
              <>
                {' '}
                · {beat ? 'was' : 'best'} {formatDuration(result.previous)}
              </>
            )}
          </>
        )}
      </p>

      <div className="enter mt-8 flex items-center justify-center gap-8" style={{ '--i': 1 } as CSSProperties}>
        <Stat label="accuracy">
          <Ring value={accuracy} size={64} width={5}>
            <Count value={accuracy * 100} className="font-mono text-[13px]" />
          </Ring>
        </Stat>
        <Stat label={gained > 0 ? `mastery +${gained}` : 'mastery'}>
          <Ring value={result.after} size={64} width={5}>
            <Count value={result.after * 100} className="font-mono text-[13px]" />
          </Ring>
        </Stat>
      </div>

      <div className="enter mt-8 flex flex-wrap justify-center gap-2.5" style={{ '--i': 2 } as CSSProperties}>
        <Button variant="primary" size="lg" onClick={onAgain} autoFocus>
          <Icon name="again" size={16} stroke={2} />
          Play again
          <Kbd on>↵</Kbd>
        </Button>
        <Button size="lg" onClick={onLeave}>
          Done
          <Kbd>Esc</Kbd>
        </Button>
      </div>

      {result.missed.length > 0 && (
        <div className="enter mt-10 w-full text-left select-text" style={{ '--i': 3 } as CSSProperties}>
          <p className="label-mono mb-2 text-muted">worth another look · these will come back sooner</p>
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

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2">
      {children}
      <span className="label-mono text-muted">{label}</span>
    </div>
  );
}
