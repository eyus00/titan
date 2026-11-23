import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AnimatePresence } from 'motion/react';
import Button, { btn } from '../components/Button';
import Icon, { type IconName } from '../components/Icon';
import Kbd from '../components/Kbd';
import { Confirm } from '../components/Modal';
import { Count, Ring, STAGE_INFO, StageRing } from '../components/Ring';
import { toast } from '../components/Toast';
import { useHotkeys } from '../lib/hotkeys';
import { hardest, isDue, mastery, progress, stage, type Progress } from '../lib/learn';
import { toText } from '../lib/parse';
import { useProximity } from '../lib/proximity';
import { actions, playable, useStore, type Card, type StudySet } from '../lib/store';
import { cx, formatDuration, percent, plural, useTitle } from '../lib/util';
import NotFound from './NotFound';

export default function SetView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const set = useStore((s) => s.sets.find((x) => x.id === id));
  const pairs = useStore((s) => s.settings.pairs);
  const [confirm, setConfirm] = useState<'delete' | 'reset' | null>(null);
  useTitle(set?.title);
  const modes = useProximity<HTMLDivElement>(220);

  const cards = useMemo(() => (set ? playable(set) : []), [set]);
  // One moment in time for everything on the page, so the numbers agree with each other.
  const now = useMemo(() => Date.now(), [set]);
  const p = useMemo(() => (set ? progress(cards, set.stats, now) : null), [set, cards, now]);

  const canMatch = cards.length >= 2;
  const canFlip = cards.length >= 1;

  const copy = async () => {
    if (!set) return;
    try {
      await navigator.clipboard.writeText(toText(set.cards));
      toast(`Copied ${plural(set.cards.length, 'card')} as text`);
    } catch {
      toast("Couldn't reach the clipboard.");
    }
  };

  useHotkeys('This set', [
    { keys: ['m'], label: 'Play match', when: canMatch, run: () => navigate(`/set/${id}/match`) },
    { keys: ['f'], label: 'Flashcards', when: canFlip, run: () => navigate(`/set/${id}/cards`) },
    { keys: ['q'], label: 'Quiz', when: canMatch, run: () => navigate(`/set/${id}/quiz`) },
    { keys: ['e'], label: 'Edit', when: !!set, run: () => navigate(`/set/${id}/edit`) },
    { keys: ['c'], label: 'Copy as text', when: !!set, run: () => void copy() },
    { keys: ['Escape'], label: 'Back to your sets', run: () => navigate('/') },
  ]);

  if (!set || !p) return <NotFound what="set" />;

  const best = set.best[Math.min(pairs, cards.length)] ?? Object.values(set.best).sort((a, b) => a - b)[0];

  const remove = () => {
    actions.deleteSet(set.id);
    navigate('/', { replace: true });
    toast(`Deleted “${set.title}”`, { label: 'Undo', run: () => actions.restoreSet(set) });
  };

  const reset = () => {
    const before = set;
    actions.resetProgress(set.id);
    setConfirm(null);
    toast('Progress reset', { label: 'Undo', run: () => actions.importBackup([before]) });
  };

  return (
    <>
      <Link to="/" className="enter label-mono mt-6 inline-flex w-fit items-center gap-1.5 rounded py-1 text-muted transition-colors duration-150 hover:text-fg sm:mt-9">
        <Icon name="back" size={14} />
        sets
        <Kbd className="ml-1">Esc</Kbd>
      </Link>

      <h1 className="enter mt-3 font-serif text-[clamp(2.5rem,9vw,4rem)] leading-none tracking-[-0.01em] text-balance break-words">{set.title}</h1>
      <p className="enter label-mono mt-3 text-muted">
        {plural(set.cards.length, 'term')}
        {set.plays > 0 && <> · {plural(set.plays, 'board')} cleared</>}
        {best !== undefined && <> · best {formatDuration(best)}</>}
      </p>

      <div ref={modes} className="enter mt-7 grid gap-3 sm:grid-cols-3" style={{ '--i': 1 } as CSSProperties}>
        <Mode to={`/set/${set.id}/match`} icon="grid" title="Match" hint="M" enabled={canMatch}>
          Pair terms and definitions against the clock, or in an endless run.
        </Mode>
        <Mode to={`/set/${set.id}/cards`} icon="cards" title="Flashcards" hint="F" enabled={canFlip}>
          Flip through the deck. Missed cards come back until they stick.
        </Mode>
        <Mode to={`/set/${set.id}/quiz`} icon="choice" title="Quiz" hint="Q" enabled={canMatch}>
          Pick the right answer out of four. No clock, just recall.
        </Mode>
      </div>
      {!canMatch && <p className="mt-3 text-sm text-pretty text-muted">Add at least two cards with both a term and a definition to play.</p>}

      <div className="enter mt-3 flex flex-wrap items-center gap-2" style={{ '--i': 1 } as CSSProperties}>
        <Link to={`/set/${set.id}/edit`} className={btn()}>
          <Icon name="edit" size={16} stroke={2} />
          Edit
          <Kbd>E</Kbd>
        </Link>
        <Button onClick={copy}>
          <Icon name="copy" size={16} stroke={2} />
          Copy as text
          <Kbd>C</Kbd>
        </Button>
        <Button icon aria-label="Delete set" title="Delete set" onClick={() => setConfirm('delete')} className="ml-auto">
          <Icon name="trash" size={16} />
        </Button>
      </div>

      {cards.length > 0 && (
        <section className="enter mt-10" style={{ '--i': 2 } as CSSProperties} aria-label="Progress">
          <ProgressPanel p={p} set={set} cards={cards} now={now} onReset={() => setConfirm('reset')} />
        </section>
      )}

      {set.cards.length > 0 && (
        <section className="enter mt-10" style={{ '--i': 3 } as CSSProperties}>
          <h2 className="label-mono mb-2 text-muted">terms</h2>
          <ol className="border-t border-line">
            {set.cards.map((c, i) => {
              const stat = set.stats[c.id];
              const st = stage(stat, now);
              return (
                <li key={c.id} className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-line py-4 sm:grid-cols-[1.75rem_minmax(0,2fr)_minmax(0,3fr)_auto] sm:gap-x-5">
                  <span className="label-mono pt-[3px] text-faint tabular-nums">{i + 1}</span>
                  <span className={cx('text-[15px] leading-snug break-words whitespace-pre-line', !c.term && 'text-faint')}>{c.term || 'no term'}</span>
                  <span className={cx('col-start-2 row-start-2 text-[15px] leading-snug break-words whitespace-pre-line sm:col-start-3 sm:row-start-1', c.def ? 'text-muted' : 'text-faint')}>
                    {c.def || 'no definition'}
                  </span>
                  <span className="col-start-3 row-start-1 pt-[3px] sm:col-start-4" title={`${STAGE_INFO.find((s) => s.key === st)!.label}${isDue(stat, now) ? ', due for review' : ''}`}>
                    <Ring value={mastery(stat, now)} size={16} width={2.5} tone={isDue(stat, now) ? 'text-fg/45' : 'text-fg'} />
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <AnimatePresence>
        {confirm === 'delete' && (
          <Confirm key="delete" title="Delete this set?" body={`“${set.title}” and everything learned in it will be removed from this browser.`} action="Delete" danger onConfirm={remove} onClose={() => setConfirm(null)} />
        )}
        {confirm === 'reset' && (
          <Confirm key="reset" title="Reset progress?" body="Mastery, accuracy and best times for this set go back to zero. The cards stay." action="Reset" danger onConfirm={reset} onClose={() => setConfirm(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

/** A way to study the set: a large card that opens it. */
function Mode({ to, icon, title, hint, enabled, children }: { to: string; icon: IconName; title: string; hint: string; enabled: boolean; children: string }) {
  return (
    <Link
      to={to}
      aria-disabled={!enabled}
      tabIndex={enabled ? undefined : -1}
      onClick={(e) => !enabled && e.preventDefault()}
      className="near group flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 transition-[scale,opacity] duration-150 ease-out active:scale-[0.98] aria-disabled:pointer-events-none aria-disabled:opacity-40"
    >
      <span className="flex items-center justify-between">
        <Icon name={icon} size={22} />
        <Kbd>{hint}</Kbd>
      </span>
      <span>
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-serif text-[1.9rem] leading-none tracking-[-0.01em]">{title}</span>
          <Icon name="forward" size={16} className="translate-y-px text-faint transition-[color,translate] duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-fg" />
        </span>
        <span className="mt-2 block text-sm leading-snug text-pretty text-muted">{children}</span>
      </span>
    </Link>
  );
}

function ProgressPanel({ p, set, cards, now, onReset }: { p: Progress; set: StudySet; cards: Card[]; now: number; onReset: () => void }) {
  const hard = useMemo(() => hardest(cards, set.stats, now, 4), [cards, set.stats, now]);
  const started = p.answers > 0;
  return (
    <div className="rounded-3xl border border-line bg-surface p-5 sm:p-7">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-9">
        <StageRing counts={p.counts}>
          <span className="flex flex-col items-center">
            <span className="font-serif text-[2.6rem] leading-none tracking-[-0.02em]">
              <Count value={p.mastery * 100} />
              <span className="text-[0.5em] text-muted">%</span>
            </span>
            <span className="label-mono mt-1 text-muted">mastery</span>
          </span>
        </StageRing>

        <div className="w-full min-w-0 flex-1">
          {started ? (
            <>
              <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                {STAGE_INFO.map((s) => (
                  <li key={s.key} className="flex items-center gap-2.5 text-sm">
                    <span className={cx('size-2.5 shrink-0 rounded-[3px] bg-current', s.tone)} />
                    <span className="text-muted">{s.label}</span>
                    <span className="ml-auto font-mono text-[13px] tabular-nums">{p.counts[s.key]}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-5 flex flex-wrap gap-x-7 gap-y-3 border-t border-line pt-4">
                <Fact label="accuracy" value={p.accuracy === null ? '–' : percent(p.accuracy)} />
                <Fact label="to review" value={String(p.due)} />
                <Fact label="answers" value={String(p.answers)} />
              </dl>
            </>
          ) : (
            <p className="max-w-sm text-center text-[15px] leading-relaxed text-pretty text-muted sm:text-left">
              Nothing studied yet. Play a round or flip a few cards and Titan starts tracking what you know, and brings back what you miss.
            </p>
          )}
        </div>
      </div>

      {hard.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <h3 className="label-mono text-muted">needs work · shown more often</h3>
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {hard.map((c) => (
              <li key={c.id} className="flex max-w-full items-center gap-2 rounded-full bg-fg/[0.07] py-1 pr-3 pl-2.5 text-[13px]">
                <span className="truncate">{c.term}</span>
                <span className="label-mono shrink-0 text-faint">missed {set.stats[c.id].wrong}×</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {started && (
        <button type="button" onClick={onReset} className="label-mono mt-5 rounded text-faint transition-colors duration-150 hover:text-fg">
          reset progress
        </button>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label-mono text-faint">{label}</dt>
      <dd className="mt-0.5 font-mono text-[15px] tabular-nums">{value}</dd>
    </div>
  );
}
