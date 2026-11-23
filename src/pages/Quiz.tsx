import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { btn } from '../components/Button';
import DeckDone from '../components/DeckDone';
import Icon from '../components/Icon';
import Kbd from '../components/Kbd';
import Shortcuts from '../components/Shortcuts';
import { sfx } from '../lib/audio';
import { useHotkeys } from '../lib/hotkeys';
import { progress, rank } from '../lib/learn';
import { actions, getState, playable, useStore, type Card, type StudySet } from '../lib/store';
import { cx, shuffle, useGameScreen, useTitle } from '../lib/util';
import NotFound from './NotFound';

export default function Quiz() {
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
        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-pretty text-muted">A quiz needs at least two cards with both a term and a definition.</p>
        <Link to={`/set/${set.id}/edit`} className={btn({ variant: 'primary' }) + ' mt-7'}>
          Edit this set
        </Link>
      </div>
    );
  }
  return <Session key={set.id} set={set} cards={cards} />;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The choices for a question: the right card plus up to three others. The card it was last
 * mixed up with is always among them, since telling those two apart is the point.
 */
function choicesFor(card: Card, cards: Card[], mix: string | undefined): Card[] {
  const others = shuffle(cards.filter((c) => c.id !== card.id && !same(c.term, card.term) && !same(c.def, card.def)));
  const partner = others.find((c) => c.id === mix);
  const picked: Card[] = partner ? [partner] : [];
  for (const c of others) {
    if (picked.length >= 3) break;
    if (!picked.some((p) => same(p.term, c.term) || same(p.def, c.def))) picked.push(c);
  }
  return shuffle([card, ...picked]);
}

function Session({ set, cards }: { set: StudySet; cards: Card[] }) {
  const navigate = useNavigate();
  const sound = useStore((s) => s.settings.sfx);
  useTitle(set.title);
  useGameScreen();

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const stats = () => getState().sets.find((s) => s.id === set.id)?.stats ?? {};
  const order = useCallback(() => rank(cards, getState().sets.find((s) => s.id === set.id)?.stats ?? {}, { now: Date.now() }).map((c) => c.id), [cards, set.id]);

  const [queue, setQueue] = useState<string[]>(order);
  const [known, setKnown] = useState(0);
  /** Asking for the term (shown the definition) or the other way round. */
  const [asks, setAsks] = useState<'term' | 'def'>('term');
  /** The option picked for the current question, once answered. */
  const [picked, setPicked] = useState<string | null>(null);
  const missed = useRef(new Set<string>());
  const before = useRef(progress(cards, set.stats, Date.now()).mastery);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const card = queue.length ? byId.get(queue[0]) : undefined;
  const total = known + new Set(queue).size;
  // The same choices for as long as the question is on screen.
  const options = useMemo(() => (card ? choicesFor(card, cards, stats()[card.id]?.mix) : []), [card?.id, queue.length, known]); // eslint-disable-line react-hooks/exhaustive-deps
  const leave = useCallback(() => navigate(`/set/${set.id}`), [navigate, set.id]);
  const correct = picked !== null && picked === card?.id;

  const next = () => {
    if (!card || picked === null) return;
    window.clearTimeout(timer.current);
    const rest = queue.slice(1);
    if (picked === card.id) {
      setKnown((k) => k + 1);
      setQueue(rest);
    } else {
      // Back into the deck a few questions from now.
      const at = Math.min(rest.length, 3);
      setQueue([...rest.slice(0, at), card.id, ...rest.slice(at)]);
    }
    setPicked(null);
  };
  const nextRef = useRef(next);
  nextRef.current = next;

  const answer = (option: Card) => {
    if (!card || picked !== null) return;
    const ok = option.id === card.id;
    setPicked(option.id);
    actions.answer(set.id, [{ id: card.id, correct: ok, mixedWith: ok ? undefined : option.id }]);
    if (ok) {
      sfx('know');
      // A right answer moves on by itself; a wrong one waits to be read.
      timer.current = window.setTimeout(() => nextRef.current(), 650);
    } else {
      missed.current.add(card.id);
      sfx('miss');
    }
  };

  const restart = () => {
    missed.current = new Set();
    before.current = progress(cards, stats(), Date.now()).mastery;
    setQueue(order());
    setKnown(0);
    setPicked(null);
  };

  useHotkeys('Quiz', [
    ...options.map((o, i) => ({ keys: [String(i + 1)], label: i === 0 ? `Choose an answer (1 to ${options.length})` : undefined, when: picked === null, run: () => answer(o) })),
    { keys: ['Enter', ' '], label: card ? 'Next question' : 'Go again', when: !card || picked !== null, run: card ? next : restart },
    { keys: ['t'], label: 'Ask for the other side', when: picked === null, run: () => setAsks((a) => (a === 'term' ? 'def' : 'term')) },
    { keys: ['n'], label: 'Sound effects on or off', run: () => actions.setSettings({ sfx: !sound }) },
    { keys: ['Escape'], label: 'Leave', run: leave },
  ]);

  const prompt = card ? (asks === 'term' ? card.def : card.term) : '';
  const face = (c: Card) => (asks === 'term' ? c.term : c.def);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden overscroll-none bg-bg">
      <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-2 sm:px-4" style={{ marginTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center">
          <button type="button" onClick={leave} aria-label="Leave the quiz" className={btn({ variant: 'ghost', icon: true })}>
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="flex w-40 flex-col items-center gap-1.5 sm:w-56">
          <span className="label-mono text-muted tabular-nums">
            {known} / {total}
          </span>
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-fg/[0.1]" role="progressbar" aria-label="Questions answered" aria-valuemin={0} aria-valuemax={total} aria-valuenow={known}>
            <div className="h-full origin-left rounded-full bg-fg transition-transform duration-500 ease-[cubic-bezier(0.2,0,0,1)]" style={{ transform: `scaleX(${total ? known / total : 0})` }} />
          </div>
        </div>
        <div className="flex items-center justify-end">
          <button type="button" onClick={() => setAsks((a) => (a === 'term' ? 'def' : 'term'))} disabled={picked !== null} title="Ask for the other side (T)" className={cx(btn({ variant: 'ghost', size: 'sm' }), 'label-mono')}>
            {asks === 'term' ? 'name the term' : 'pick the definition'}
          </button>
          <button type="button" onClick={() => actions.setSettings({ sfx: !sound })} aria-label="Sound effects" aria-pressed={sound} title={`Sound effects ${sound ? 'on' : 'off'} (N)`} className={btn({ variant: 'ghost', icon: true })}>
            <Icon name={sound ? 'sound' : 'soundOff'} size={20} />
          </button>
        </div>
      </header>

      {card ? (
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-8">
          {/* Keyed by question, so each one arrives fresh. */}
          <div key={`${card.id}:${known}:${queue.length}`} className="m-auto flex w-full max-w-2xl flex-col py-4">
            <p className="enter label-mono text-faint">{asks === 'term' ? 'which term is this?' : 'which definition fits?'}</p>
            <h1 className={cx('enter mt-3 text-balance break-words whitespace-pre-line', asks === 'term' ? 'text-[clamp(1.15rem,3.6vw,1.6rem)] leading-snug' : 'font-serif text-[clamp(2.2rem,8vw,3.4rem)] leading-none tracking-[-0.01em]')}>{prompt}</h1>

            <div className={cx('enter mt-8 grid gap-2.5', asks === 'term' && 'sm:grid-cols-2')} style={{ '--i': 1 } as CSSProperties} role="group" aria-label="Answers">
              {options.map((o, i) => {
                const isRight = picked !== null && o.id === card.id;
                const isWrong = picked === o.id && o.id !== card.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => answer(o)}
                    disabled={picked !== null}
                    className={cx(
                      'tile flex min-h-14 items-center gap-3 rounded-2xl px-4 py-3 text-left text-[15px] leading-snug disabled:cursor-default',
                      isRight && 'tile-right',
                      isWrong && 'tile-wrong tile-shake',
                      picked !== null && !isRight && !isWrong && 'opacity-45',
                    )}
                  >
                    <span className="min-w-0 flex-1 break-words whitespace-pre-line">{face(o)}</span>
                    {isRight ? <Icon name="check" size={16} stroke={2} className="text-ok" /> : isWrong ? <Icon name="close" size={16} stroke={2} className="text-bad" /> : <Kbd>{i + 1}</Kbd>}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex h-12 items-center justify-between gap-4" aria-live="polite">
              {picked !== null && !correct && (
                <>
                  <p className="text-sm text-pretty text-muted">Not quite. It will come back in a moment.</p>
                  <button type="button" onClick={next} autoFocus className={btn({ variant: 'primary' })}>
                    Next
                    <Kbd on>↵</Kbd>
                  </button>
                </>
              )}
              {correct && <p className="text-sm text-ok">Correct.</p>}
            </div>
          </div>
        </main>
      ) : (
        <DeckDone set={set} cards={cards} total={total} firstTry={total - missed.current.size} before={before.current} onAgain={restart} onLeave={leave} />
      )}
      <Shortcuts />
    </div>
  );
}
