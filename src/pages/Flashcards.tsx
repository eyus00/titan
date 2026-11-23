import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AnimatePresence, m, useMotionValue, useTransform } from 'motion/react';
import Button, { btn } from '../components/Button';
import Icon from '../components/Icon';
import Kbd from '../components/Kbd';
import DeckDone from '../components/DeckDone';
import { Ring } from '../components/Ring';
import Shortcuts from '../components/Shortcuts';
import { sfx } from '../lib/audio';
import { fitText } from '../lib/fit';
import { useHotkeys } from '../lib/hotkeys';
import { mastery, progress, rank, type CardStat } from '../lib/learn';
import { actions, getState, playable, useStore, type Card, type StudySet } from '../lib/store';
import { cx, useGameScreen, useTitle } from '../lib/util';
import NotFound from './NotFound';

export default function Flashcards() {
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
  if (!cards.length) {
    return (
      <div className="page mx-auto flex min-h-dvh max-w-3xl flex-col items-start justify-center px-5 pb-[12vh] sm:px-8">
        <h1 className="font-serif text-5xl leading-none tracking-[-0.01em] text-balance">No cards to flip yet.</h1>
        <p className="mt-4 max-w-sm text-body leading-relaxed text-pretty text-muted">Flashcards need at least one card with both a term and a definition.</p>
        <Link to={`/set/${set.id}/edit`} className={btn({ variant: 'primary' }) + ' mt-7'}>
          Edit this set
        </Link>
      </div>
    );
  }
  return <Deck key={set.id} set={set} cards={cards} />;
}

/** One step back: what the deck looked like before a card was graded. */
interface Step {
  id: string;
  before: CardStat | undefined;
  queue: string[];
  known: number;
  missed: boolean;
}

function Deck({ set, cards }: { set: StudySet; cards: Card[] }) {
  const navigate = useNavigate();
  const front = useStore((s) => s.settings.front);
  const sound = useStore((s) => s.settings.sfx);
  useTitle(`Flashcards · ${set.title}`);
  useGameScreen();

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  /** A pass over the deck, the cards that need it most first (lib/learn.ts). */
  const order = useCallback(() => rank(cards, getState().sets.find((s) => s.id === set.id)?.stats ?? {}, { now: Date.now() }).map((c) => c.id), [cards, set.id]);

  const [queue, setQueue] = useState<string[]>(order);
  const [flipped, setFlipped] = useState(false);
  /** Cards marked as known this pass. */
  const [known, setKnown] = useState(0);
  /** Counts cards shown, so the same card coming back still animates in as a new one. */
  const [turn, setTurn] = useState(0);
  /** Which way the last card left: 1 = known (right), -1 = again (left). */
  const [way, setWay] = useState<1 | -1>(1);
  /** What just happened, for screen readers (the card itself is purely visual). */
  const [spoken, setSpoken] = useState('');
  const history = useRef<Step[]>([]);
  const missed = useRef(new Set<string>());
  const before = useRef(progress(cards, set.stats, Date.now()).mastery);

  const total = known + new Set(queue).size;
  const card = queue.length ? byId.get(queue[0]) : undefined;
  const leave = useCallback(() => navigate(`/set/${set.id}`), [navigate, set.id]);

  const flip = () => {
    if (!card) return;
    const showsDef = (front === 'term') !== flipped;
    setSpoken(showsDef ? `Definition: ${card.def}` : `Term: ${card.term}`);
    setFlipped((f) => !f);
    sfx('flip');
  };

  const grade = (ok: boolean) => {
    if (!card) return;
    const id = card.id;
    history.current.push({ id, before: getState().sets.find((s) => s.id === set.id)?.stats[id], queue, known, missed: missed.current.has(id) });
    actions.answer(set.id, [{ id, correct: ok }]);
    const rest = queue.slice(1);
    if (ok) {
      setKnown((k) => k + 1);
      setQueue(rest);
    } else {
      // Back into the deck a few cards from now, so it returns while it is still fresh.
      missed.current.add(id);
      const at = Math.min(rest.length, 3);
      setQueue([...rest.slice(0, at), id, ...rest.slice(at)]);
    }
    setWay(ok ? 1 : -1);
    setFlipped(false);
    setTurn((t) => t + 1);
    sfx(ok ? 'know' : 'again');
    const upNext = byId.get((ok ? rest : [...rest.slice(0, Math.min(rest.length, 3)), id])[0] ?? '');
    setSpoken(`${ok ? `Know it. ${known + 1} of ${total}.` : 'Still learning. It will come back.'}${upNext ? ` Next: ${front === 'term' ? upNext.term : upNext.def}` : ' Deck finished.'}`);
  };

  const undo = () => {
    const step = history.current.pop();
    if (!step) return;
    actions.unanswer(set.id, step.id, step.before);
    if (!step.missed) missed.current.delete(step.id);
    setQueue(step.queue);
    setKnown(step.known);
    setFlipped(false);
    setWay(1);
    setTurn((t) => t + 1);
    setSpoken('Undone.');
  };

  const restart = () => {
    history.current = [];
    missed.current = new Set();
    before.current = progress(cards, getState().sets.find((s) => s.id === set.id)?.stats ?? {}, Date.now()).mastery;
    setQueue(order());
    setKnown(0);
    setFlipped(false);
    setTurn((t) => t + 1);
  };

  const swapFront = () => {
    actions.setSettings({ front: front === 'term' ? 'def' : 'term' });
    setFlipped(false);
  };

  useHotkeys('Flashcards', [
    { keys: [' ', 'Enter', 'w', 's', 'ArrowUp', 'ArrowDown'], label: card ? 'Flip the card' : 'Go again', run: card ? flip : restart },
    { keys: ['d', 'ArrowRight'], label: 'Know it', when: !!card, run: () => grade(true) },
    { keys: ['a', 'ArrowLeft'], label: 'Still learning', when: !!card, run: () => grade(false) },
    { keys: ['z', 'mod+z'], label: 'Undo', when: history.current.length > 0, run: undo },
    { keys: ['t'], label: 'Show the other side first', run: swapFront },
    { keys: ['n'], label: 'Sound effects on or off', run: () => actions.setSettings({ sfx: !sound }) },
    { keys: ['Escape'], label: 'Leave', run: leave },
  ]);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden overscroll-none bg-bg select-none">
      <header className={cx('grid h-14 shrink-0 grid-cols-[1fr_minmax(0,14rem)_1fr] items-center', SAFE_X)} style={{ marginTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center">
          <button type="button" onClick={leave} aria-label="Leave flashcards" className={btn({ variant: 'ghost', icon: true })}>
            <Icon name="close" size={20} />
          </button>
          <button type="button" onClick={undo} disabled={!history.current.length} aria-label="Undo" title="Undo (Z)" className={btn({ variant: 'ghost', icon: true })}>
            <Icon name="undo" size={20} />
          </button>
        </div>
        <div className="flex w-full flex-col items-center gap-1.5 px-2">
          <span className="label-mono text-muted tabular-nums">
            {known} / {total}
          </span>
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-fg/[0.1]" role="progressbar" aria-label="Cards known" aria-valuemin={0} aria-valuemax={total} aria-valuenow={known}>
            <div className="h-full origin-left rounded-full bg-fg transition-transform duration-500 ease-[cubic-bezier(0.2,0,0,1)]" style={{ transform: `scaleX(${total ? known / total : 0})` }} />
          </div>
        </div>
        <div className="flex items-center justify-end">
          {/* Words where there is room, an icon on phones. */}
          <button type="button" onClick={swapFront} title="Show the other side first (T)" className={cx(btn({ variant: 'ghost', size: 'sm' }), 'label-mono max-sm:size-10 max-sm:px-0')}>
            <Icon name="flip" size={20} className="sm:hidden" />
            <span className="max-sm:sr-only">{front === 'term' ? 'term first' : 'definition first'}</span>
          </button>
          <button type="button" onClick={() => actions.setSettings({ sfx: !sound })} aria-label="Sound effects" aria-pressed={sound} title={`Sound effects ${sound ? 'on' : 'off'} (N)`} className={btn({ variant: 'ghost', icon: true })}>
            <Icon name={sound ? 'sound' : 'soundOff'} size={20} />
          </button>
        </div>
      </header>

      {card ? (
        <>
          <main className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-3 sm:px-8">
            <AnimatePresence mode="popLayout" custom={way} initial={false}>
              <Flashcard key={turn} card={card} front={front} flipped={flipped} stat={set.stats[card.id]} onFlip={flip} onGrade={grade} />
            </AnimatePresence>
          </main>

          <footer className="flex shrink-0 items-center justify-center gap-2 px-3 pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:gap-3 sm:px-4">
            <Button size="lg" onClick={() => grade(false)} className="min-w-0 flex-1 px-3! sm:max-w-52 sm:px-5!">
              <Icon name="close" size={16} stroke={2} className="max-sm:hidden" />
              <span className="truncate">Still learning</span>
              <Kbd>←</Kbd>
            </Button>
            <Button size="lg" icon onClick={flip} aria-label="Flip the card" title="Flip (Space)">
              <Icon name="flip" stroke={2} />
            </Button>
            <Button size="lg" variant="primary" onClick={() => grade(true)} className="min-w-0 flex-1 px-3! sm:max-w-52 sm:px-5!">
              <Icon name="check" size={16} stroke={2} className="max-sm:hidden" />
              <span className="truncate">Know it</span>
              <Kbd on>→</Kbd>
            </Button>
          </footer>
          <div className="label-mono hidden h-8 shrink-0 items-center justify-center gap-5 pb-2 text-faint keys:flex" aria-hidden>
            <span className="flex items-center gap-1.5">
              <Kbd>Space</Kbd>
              flip
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>Z</Kbd>
              undo
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>Esc</Kbd>
              leave
            </span>
          </div>
        </>
      ) : (
        <DeckDone set={set} cards={cards} total={total} firstTry={total - missed.current.size} before={before.current} onAgain={restart} onLeave={leave} />
      )}
      <p role="status" className="sr-only">
        {spoken}
      </p>
      <Shortcuts />
    </div>
  );
}

const SAFE_X = 'pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))] sm:pr-[max(1rem,env(safe-area-inset-right))] sm:pl-[max(1rem,env(safe-area-inset-left))]';
const EASE = [0.2, 0, 0, 1] as const;

/** The card: tap or press Space to turn it over, drag it aside (or use the buttons) to grade it. */
function Flashcard({
  card,
  front,
  flipped,
  stat,
  onFlip,
  onGrade,
  ref,
}: {
  card: Card;
  front: 'term' | 'def';
  flipped: boolean;
  stat: CardStat | undefined;
  onFlip: () => void;
  onGrade: (ok: boolean) => void;
  ref?: Ref<HTMLDivElement>;
}) {
  const x = useMotionValue(0);
  /** A press that turned into a drag must not also count as a tap (which would flip the card). */
  const dragged = useRef(false);
  const rotate = useTransform(x, [-240, 240], [-7, 7]);
  // The verdict shows as the card is dragged toward it.
  const yes = useTransform(x, [30, 130], [0, 1]);
  const no = useTransform(x, [-130, -30], [1, 0]);

  const sides = front === 'term' ? ([['term', card.term], ['definition', card.def]] as const) : ([['definition', card.def], ['term', card.term]] as const);
  const level = mastery(stat, Date.now());

  return (
    <m.div
      ref={ref}
      className="relative h-[min(64dvh,440px)] w-full max-w-[640px] cursor-pointer touch-pan-y [perspective:1400px]"
      style={{ x, rotate }}
      drag="x"
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={0.7}
      dragConstraints={{ left: 0, right: 0 }}
      onPointerDown={() => (dragged.current = false)}
      onDragStart={() => (dragged.current = true)}
      onDragEnd={(_, info) => {
        // Far enough, or a flick in the same direction the card already sits. Pulling back cancels.
        const flick = Math.abs(info.velocity.x) > 650 && Math.sign(info.velocity.x) === Math.sign(info.offset.x) && Math.abs(info.offset.x) > 40;
        if (Math.abs(info.offset.x) > 110 || flick) onGrade(info.offset.x > 0);
      }}
      onTap={() => {
        if (!dragged.current) onFlip();
      }}
      variants={{
        enter: { opacity: 0, scale: 0.98, y: 10 },
        show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3, ease: EASE } },
        // It leaves the way it was sent, from wherever the drag left it.
        leave: (way: number) => ({ opacity: 0, x: way * Math.max(180, Math.abs(x.get()) + 60), rotate: way * 8, transition: { duration: 0.2, ease: 'easeOut' } }),
      }}
      initial="enter"
      animate="show"
      exit="leave"
    >
      <m.div className="relative size-full [transform-style:preserve-3d]" initial={false} animate={{ rotateY: flipped ? 180 : 0 }} transition={{ type: 'spring', duration: 0.55, bounce: 0 }}>
        {sides.map(([label, text], i) => (
          <Face key={label} label={label} text={text} back={i === 1} hidden={(i === 1) !== flipped} level={level} />
        ))}
      </m.div>
      <m.span aria-hidden style={{ opacity: yes }} className="label-mono pointer-events-none absolute top-4 right-5 rounded-full bg-ok/15 px-2.5 py-1 text-ok">
        know it
      </m.span>
      <m.span aria-hidden style={{ opacity: no }} className="label-mono pointer-events-none absolute top-4 left-5 rounded-full bg-fg/10 px-2.5 py-1 text-muted">
        still learning
      </m.span>
    </m.div>
  );
}

/** The face class that changes how wide the text runs (the term side is set in the serif). */
const TERM_FACE = 'font-serif tracking-[-0.01em]';

function Face({ label, text, back, hidden, level }: { label: string; text: string; back: boolean; hidden: boolean; level: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(22);
  // The text is set as large as fits the card, like the cards in Match.
  useLayoutEffect(() => {
    const el = box.current!;
    const fit = () => setSize(fitText(text, el.clientWidth, el.clientHeight, 14, label === 'term' ? 40 : 30, label === 'term' ? TERM_FACE : '').size);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, label]);

  return (
    <div
      className="absolute inset-0 flex flex-col rounded-3xl border border-line bg-surface px-6 pt-4 pb-6 [backface-visibility:hidden] sm:px-10"
      style={{ transform: back ? 'rotateY(180deg)' : undefined } as CSSProperties}
      // Only the side facing up is there for assistive tech; the other is the answer.
      aria-hidden={hidden || undefined}
    >
      <div className="flex shrink-0 items-center justify-between">
        <span className="label-mono text-faint">{label}</span>
        <Ring value={level} size={16} width={2.5} className="opacity-80" />
      </div>
      <div ref={box} className="mt-2 flex min-h-0 flex-1 items-center justify-center overflow-y-auto overscroll-contain text-center">
        <span className={cx('card-text m-auto', label === 'term' && TERM_FACE)} style={{ fontSize: size }}>
          {text}
        </span>
      </div>
    </div>
  );
}
