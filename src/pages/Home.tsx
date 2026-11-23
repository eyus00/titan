import { Link, useNavigate } from 'react-router';
import { Play, Plus } from 'lucide-react';
import Button, { btn } from '../components/Button';
import { SAMPLE_SET } from '../lib/sample';
import { actions, playable, roundSize, useStore, type StudySet } from '../lib/store';
import { cx, formatDuration, plural, useTitle } from '../lib/util';

export default function Home() {
  const sets = useStore((s) => s.sets);
  const pairs = useStore((s) => s.settings.pairs);
  useTitle();

  if (!sets.length) return <Welcome />;

  return (
    <>
      <div className="flex items-end justify-between gap-4 pt-10 pb-7 sm:pt-14">
        <h1 className="font-serif text-5xl leading-none tracking-[-0.01em] sm:text-6xl">Your sets</h1>
        <Link to="/new" className={btn({ variant: 'primary' })}>
          <Plus className="size-4" />
          New set
        </Link>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {sets.map((set) => (
          <SetCard key={set.id} set={set} pairs={pairs} />
        ))}
      </ul>
    </>
  );
}

function SetCard({ set, pairs }: { set: StudySet; pairs: number }) {
  const ready = playable(set).length;
  const best = set.best[roundSize(ready, pairs)];
  return (
    <li className="group relative flex min-h-36 flex-col justify-between gap-6 rounded-2xl border border-line bg-surface p-5 transition-colors duration-150 hover:border-fg/30">
      <h2 className="line-clamp-2 font-serif text-[1.65rem] leading-[1.1] break-words">
        {/* The whole card opens the set; the play button sits above this link. */}
        <Link to={`/set/${set.id}`} className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-fg">
          {set.title}
        </Link>
      </h2>
      <div className="flex items-end justify-between gap-3">
        <p className="label-mono text-muted">
          {plural(set.cards.length, 'term')}
          {best !== undefined && <> · best {formatDuration(best)}</>}
        </p>
        {ready >= 2 && (
          <Link to={`/set/${set.id}/match`} aria-label={`Play ${set.title}`} className={cx(btn({ icon: true }), 'relative z-10 -m-1 group-hover:bg-fg group-hover:text-bg')}>
            <Play className="size-4 translate-x-px fill-current" />
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
  return (
    <div className="flex flex-1 flex-col justify-center pt-10 pb-[12vh]">
      <h1 className="max-w-[11ch] font-serif text-[clamp(3.2rem,13vw,5.5rem)] leading-[0.95] tracking-[-0.015em]">
        Match terms, <em>fast.</em>
      </h1>
      <p className="mt-6 max-w-md text-[17px] leading-relaxed text-pretty text-muted">
        Paste a list of words and definitions, then pair them up against the clock. Cards show the whole definition, however long it is.
      </p>
      <div className="mt-9 flex flex-wrap gap-3">
        <Link to="/new" className={btn({ variant: 'primary', size: 'lg' })}>
          <Plus className="size-[18px]" />
          New set
        </Link>
        <Button size="lg" onClick={trySample}>
          Try a sample
        </Button>
      </div>
    </div>
  );
}
