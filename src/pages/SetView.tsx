import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Copy, Pencil, Play, Trash2 } from 'lucide-react';
import Button, { btn } from '../components/Button';
import { Confirm } from '../components/Modal';
import { toast } from '../components/Toast';
import { toText } from '../lib/parse';
import { actions, playable, roundSize, useStore } from '../lib/store';
import { cx, formatDuration, plural, useTitle } from '../lib/util';
import NotFound from './NotFound';

export default function SetView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const set = useStore((s) => s.sets.find((x) => x.id === id));
  const pairs = useStore((s) => s.settings.pairs);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useTitle(set?.title);

  const ready = useMemo(() => (set ? playable(set).length : 0), [set]);
  if (!set) return <NotFound what="set" />;

  const round = roundSize(ready, pairs);
  const best = set.best[round];
  const canPlay = ready >= 2;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toText(set.cards));
      toast(`Copied ${plural(set.cards.length, 'card')} as text`);
    } catch {
      toast("Couldn't reach the clipboard.");
    }
  };

  const remove = () => {
    actions.deleteSet(set.id);
    navigate('/', { replace: true });
    toast(`Deleted “${set.title}”`, { label: 'Undo', run: () => actions.restoreSet(set) });
  };

  return (
    <>
      <Link to="/" className="label-mono mt-6 inline-flex w-fit items-center gap-1.5 rounded py-1 text-muted transition-colors hover:text-fg sm:mt-9">
        <ArrowLeft className="size-3.5" strokeWidth={1.75} />
        sets
      </Link>

      <h1 className="mt-3 font-serif text-[clamp(2.5rem,9vw,4rem)] leading-none tracking-[-0.01em] break-words">{set.title}</h1>
      <p className="label-mono mt-3 text-muted">
        {plural(set.cards.length, 'term')}
        {set.plays > 0 && <> · played {set.plays}×</>}
        {best !== undefined && (
          <>
            {' '}
            · best {formatDuration(best)} with {plural(round, 'pair')}
          </>
        )}
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-2">
        <Link
          to={`/set/${set.id}/match`}
          aria-disabled={!canPlay}
          tabIndex={canPlay ? undefined : -1}
          onClick={(e) => !canPlay && e.preventDefault()}
          className={cx(btn({ variant: 'primary', size: 'lg' }), 'mr-1')}
        >
          <Play className="size-4 fill-current" />
          Play match
        </Link>
        <Link to={`/set/${set.id}/edit`} className={btn({ size: 'lg' })}>
          <Pencil className="size-4" strokeWidth={1.75} />
          Edit
        </Link>
        <Button size="lg" icon aria-label="Copy as text" title="Copy as text" onClick={copy}>
          <Copy className="size-4" strokeWidth={1.75} />
        </Button>
        <Button size="lg" icon aria-label="Delete set" title="Delete set" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="size-4" strokeWidth={1.75} />
        </Button>
      </div>
      {!canPlay && <p className="mt-3 text-sm text-muted">Add at least two cards with both a term and a definition to play.</p>}

      {set.cards.length > 0 && (
        <ol className="mt-10 border-t border-line">
          {set.cards.map((c, i) => (
            <li key={c.id} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-line py-4 sm:grid-cols-[1.75rem_minmax(0,2fr)_minmax(0,3fr)] sm:gap-x-5">
              <span className="label-mono pt-[3px] text-faint">{i + 1}</span>
              <span className={cx('text-[15px] leading-snug break-words whitespace-pre-line', !c.term && 'text-faint')}>{c.term || 'no term'}</span>
              <span className={cx('col-start-2 text-[15px] leading-snug break-words whitespace-pre-line sm:col-start-3', c.def ? 'text-muted' : 'text-faint')}>
                {c.def || 'no definition'}
              </span>
            </li>
          ))}
        </ol>
      )}

      {confirmDelete && (
        <Confirm
          title="Delete this set?"
          body={`“${set.title}” and its best times will be removed from this browser.`}
          action="Delete"
          danger
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
