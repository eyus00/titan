import { useMemo, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import Button, { btn } from '../components/Button';
import Icon from '../components/Icon';
import Kbd from '../components/Kbd';
import { Ring } from '../components/Ring';
import { useHotkeys } from '../lib/hotkeys';
import { dayKey, lastDays, progress, streak } from '../lib/learn';
import { useProximity } from '../lib/proximity';
import { SAMPLE_SET } from '../lib/sample';
import { actions, playable, useStore, type StudySet } from '../lib/store';
import { cx, plural, useTitle } from '../lib/util';

export default function Home() {
  const sets = useStore((s) => s.sets);
  const activity = useStore((s) => s.activity);
  const navigate = useNavigate();
  const grid = useProximity<HTMLUListElement>(260);
  useTitle();

  useHotkeys('Your sets', [
    { keys: ['n'], label: 'New set', run: () => navigate('/new') },
    ...sets.slice(0, 9).map((set, i) => ({ keys: [String(i + 1)], label: i === 0 ? 'Open a set (1 to 9)' : undefined, run: () => navigate(`/set/${set.id}`) })),
  ]);

  if (!sets.length) return <Welcome />;

  const now = Date.now();
  const days = streak(activity, now);
  const today = activity[dayKey(now)] ?? 0;

  return (
    <>
      <div className="enter flex items-end justify-between gap-4 pt-10 sm:pt-14">
        <h1 className="font-serif text-5xl leading-none tracking-[-0.01em] sm:text-6xl">Your sets</h1>
        <Link to="/new" className={btn({ variant: 'primary' })}>
          <Icon name="plus" size={16} stroke={2} />
          New set
          <Kbd on>N</Kbd>
        </Link>
      </div>
      <div className="enter mt-3 flex min-h-6 flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <p className="label-mono flex items-center gap-1.5 text-muted">
          {days > 0 ? (
            <>
              <Icon name="bolt" size={14} className={today ? 'text-fg' : undefined} />
              {plural(days, 'day')} in a row
              {today > 0 ? <> · {plural(today, 'answer')} today</> : <> · study today to keep it</>}
            </>
          ) : (
            <>{plural(sets.length, 'set')}</>
          )}
        </p>
        {days > 0 && <Activity now={now} activity={activity} />}
      </div>
      <ul ref={grid} className="enter mt-6 grid gap-3 sm:grid-cols-2" style={{ '--i': 1 } as CSSProperties}>
        {sets.map((set, i) => (
          <SetCard key={set.id} set={set} index={i} now={now} />
        ))}
      </ul>
    </>
  );
}

const DAY = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/** The last two weeks at a glance: one bar a day, taller for more answers. */
function Activity({ activity, now }: { activity: Record<string, number>; now: number }) {
  const week = lastDays(activity, now, 14);
  const most = Math.max(1, ...week.map((d) => d.count));
  return (
    <div className="flex h-5 shrink-0 items-end gap-[3px]" role="img" aria-label={`Answers per day over the last 14 days. Today: ${week[week.length - 1].count}.`}>
      {week.map((d, i) => (
        <span
          key={d.key}
          title={`${DAY.format(new Date(`${d.key}T12:00`))}: ${plural(d.count, 'answer')}`}
          className={cx('w-[5px] rounded-[1.5px]', i === week.length - 1 ? 'bg-fg' : d.count ? 'bg-fg/55' : 'bg-fg/[0.12]')}
          style={{ height: d.count ? `${Math.max(20, (d.count / most) * 100)}%` : 3 }}
        />
      ))}
    </div>
  );
}

function SetCard({ set, index, now }: { set: StudySet; index: number; now: number }) {
  const cards = useMemo(() => playable(set), [set]);
  const p = useMemo(() => progress(cards, set.stats, now), [cards, set.stats, now]);
  return (
    <li className="near group flex min-h-40 flex-col justify-between gap-6 rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="line-clamp-2 font-serif text-[1.65rem] leading-[1.1] tracking-[-0.01em] text-balance break-words">
          {/* The whole card opens the set; the play button sits above this link. */}
          <Link to={`/set/${set.id}`} className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-fg">
            {set.title}
          </Link>
        </h2>
        {index < 9 && <Kbd className="mt-1 shrink-0">{index + 1}</Kbd>}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <Ring value={p.mastery} size={34} width={3.5} />
          <p className="label-mono text-muted">
            {plural(set.cards.length, 'card')}
            <br />
            {p.answers ? (
              <>
                {Math.round(p.mastery * 100)}% mastery{p.due > 0 && <> · {p.due} to review</>}
              </>
            ) : (
              'not studied yet'
            )}
          </p>
        </div>
        {cards.length >= 2 && (
          <Link
            to={`/set/${set.id}/match`}
            aria-label={`Play ${set.title}`}
            className={cx(btn({ icon: true }), 'relative z-10 -m-1 group-hover:bg-fg! group-hover:text-bg! hover:opacity-85')}
          >
            <Icon name="play" size={16} className="translate-x-px" />
          </Link>
        )}
      </div>
    </li>
  );
}

/** First visit: say what this is, and offer a way in. */
function Welcome() {
  const navigate = useNavigate();
  const trySample = () => {
    const set = actions.createSet(SAMPLE_SET);
    navigate(`/set/${set.id}`);
  };
  useHotkeys('Start', [{ keys: ['s'], label: 'Try a sample set', run: trySample }]);
  return (
    <div className="flex flex-1 flex-col justify-center pt-10 pb-[12vh]">
      <h1 className="enter max-w-[11ch] font-serif text-[clamp(3.2rem,13vw,5.5rem)] leading-[0.95] tracking-[-0.015em]">
        Learn terms, <em>fast.</em>
      </h1>
      <p className="enter mt-6 max-w-md text-lead leading-relaxed text-pretty text-muted" style={{ '--i': 1 } as CSSProperties}>
        Paste a list of terms and definitions, then match them against the clock, flip through them or take a quiz. Titan keeps track of what you know and brings back what you miss.
      </p>
      <div className="enter mt-9 flex flex-wrap gap-3" style={{ '--i': 2 } as CSSProperties}>
        <Link to="/new" className={btn({ variant: 'primary', size: 'lg' })}>
          <Icon name="plus" size={18} stroke={2} />
          New set
          <Kbd on>N</Kbd>
        </Link>
        <Button size="lg" onClick={trySample}>
          Try a sample set
          <Kbd>S</Kbd>
        </Button>
      </div>
    </div>
  );
}
