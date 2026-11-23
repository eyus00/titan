import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type Ref, type TextareaHTMLAttributes } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router';
import { AnimatePresence } from 'motion/react';
import Button, { btn } from '../components/Button';
import Icon from '../components/Icon';
import ImportDialog from '../components/ImportDialog';
import Kbd, { MOD } from '../components/Kbd';
import { Confirm } from '../components/Modal';
import { toast } from '../components/Toast';
import { useHotkeys } from '../lib/hotkeys';
import type { ParsedCard } from '../lib/parse';
import { actions, useStore, type StudySet } from '../lib/store';
import { cx, plural, uid, useTitle } from '../lib/util';
import NotFound from './NotFound';

interface Row {
  id: string;
  term: string;
  def: string;
}

const blank = (): Row => ({ id: uid(), term: '', def: '' });
const isEmpty = (r: Row) => !r.term.trim() && !r.def.trim();

/** /new and /set/:id/edit */
export default function Editor() {
  const { id } = useParams();
  const existing = useStore((s) => (id ? s.sets.find((x) => x.id === id) : undefined));
  if (id && !existing) return <NotFound what="set" />;
  return <Form key={id ?? 'new'} set={existing} />;
}

function Form({ set }: { set?: StudySet }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(set?.title ?? '');
  const [rows, setRows] = useState<Row[]>(() => (set?.cards.length ? set.cards.map((c) => ({ ...c })) : [blank(), blank(), blank()]));
  const [importing, setImporting] = useState(false);
  /** Row whose term box takes focus once it appears (a row that was just added). */
  const [focusId, setFocusId] = useState<string>();
  const [dirty, setDirty] = useState(false);
  /** Set right before leaving on purpose, so the "discard changes?" check stays quiet. */
  const leaving = useRef(false);
  useTitle(set ? `Edit ${set.title}` : 'New set');

  const filled = rows.filter((r) => !isEmpty(r));
  const back = set ? `/set/${set.id}` : '/';

  // Leaving with unsaved edits asks first (in-app links here, the browser's own prompt on reload or close).
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const change = useCallback((id: string, field: 'term' | 'def', value: string) => {
    setDirty(true);
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }, []);

  const remove = useCallback((id: string) => {
    setDirty(true);
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : [blank()]));
  }, []);

  const add = useCallback(() => {
    const row = blank();
    setRows((rs) => [...rs, row]);
    setFocusId(row.id);
  }, []);

  const onImport = (cards: ParsedCard[], fileName?: string) => {
    setRows((rs) => [...rs.filter((r) => !isEmpty(r)), ...cards.map((c) => ({ id: uid(), ...c }))]);
    if (!title.trim() && fileName) setTitle(fileName);
    setDirty(true);
    setImporting(false);
    toast(`Added ${plural(cards.length, 'card')}`);
  };

  const save = () => {
    if (!filled.length) return toast('Add at least one card first.');
    leaving.current = true;
    const draft = { title, cards: filled };
    if (set) {
      actions.updateSet(set.id, draft);
      navigate(`/set/${set.id}`);
    } else {
      navigate(`/set/${actions.createSet(draft).id}`, { replace: true });
    }
  };

  useHotkeys(set ? 'Editing' : 'New set', [
    { keys: ['mod+s'], label: set ? 'Save changes' : 'Create the set', inFields: true, run: save },
    { keys: ['mod+i'], label: 'Import a list', inFields: true, run: () => setImporting(true) },
    { keys: ['mod+Enter'], label: 'Add a card', inFields: true, run: add },
    { keys: ['Escape'], label: 'Leave without saving', run: () => navigate(back) },
  ]);

  return (
    <>
      <Link to={back} className="label-mono mt-6 inline-flex w-fit items-center gap-1.5 rounded py-1 text-muted transition-colors duration-150 hover:text-fg sm:mt-9">
        <Icon name="back" size={14} />
        {set ? 'back to set' : 'sets'}
        <Kbd className="ml-1">Esc</Kbd>
      </Link>

      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setDirty(true);
        }}
        placeholder="Name this set"
        aria-label="Set title"
        maxLength={120}
        autoFocus={!set}
        className="mt-3 w-full border-b border-line bg-transparent pb-2 font-serif text-[clamp(2.2rem,8vw,3.5rem)] leading-tight tracking-[-0.01em] transition-colors placeholder:text-faint focus:border-fg/50"
      />

      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="label-mono text-muted">{plural(filled.length, 'card')}</p>
        <Button onClick={() => setImporting(true)}>
          <Icon name="list" size={16} stroke={2} />
          Import a list
          <Kbd>{MOD}</Kbd>
          <Kbd className="-ml-1">I</Kbd>
        </Button>
      </div>

      <ol className="mt-4 space-y-2.5">
        {rows.map((row, i) => (
          <RowEditor key={row.id} row={row} index={i} last={i === rows.length - 1} focus={row.id === focusId} onChange={change} onRemove={remove} onAdd={add} />
        ))}
      </ol>

      <button
        type="button"
        onClick={add}
        className="mt-2.5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-sm text-muted transition-colors hover:border-fg/30 hover:text-fg"
      >
        <Icon name="plus" size={16} />
        Add a card
      </button>

      {/* Room for the save bar, which stays at the bottom of the screen. */}
      <div className="h-24" />
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-end gap-2 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8">
          <span className="label-mono mr-auto hidden items-center gap-1.5 text-faint keys:flex">
            <Kbd>Tab</Kbd>
            from the last definition adds a card
          </span>
          <Link to={back} className={btn()}>
            Cancel
          </Link>
          <Button variant="primary" onClick={save}>
            {set ? 'Save changes' : 'Create set'}
            <Kbd on>{MOD}</Kbd>
            <Kbd on className="-ml-1">
              S
            </Kbd>
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {importing && <ImportDialog key="import" onImport={onImport} onClose={() => setImporting(false)} />}
        {blocker.state === 'blocked' && (
          <Confirm
            key="discard"
            title="Discard changes?"
            body="What you changed on this page hasn't been saved."
            action="Discard"
            danger
            onConfirm={() => blocker.proceed()}
            onClose={() => blocker.reset()}
          />
        )}
      </AnimatePresence>
    </>
  );
}

const RowEditor = memo(function RowEditor({
  row,
  index,
  last,
  focus,
  onChange,
  onRemove,
  onAdd,
}: {
  row: Row;
  index: number;
  last: boolean;
  focus: boolean;
  onChange: (id: string, field: 'term' | 'def', value: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  const term = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focus) term.current?.focus();
  }, [focus]);

  // Tab out of the last definition continues into a fresh card.
  const onDefKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (last && e.key === 'Tab' && !e.shiftKey && (row.term.trim() || row.def.trim())) {
      e.preventDefault();
      onAdd();
    }
  };

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 rounded-2xl border border-line bg-surface py-2 pr-2 pl-4 transition-colors focus-within:border-fg/30 sm:grid-cols-[1.5rem_minmax(0,2fr)_minmax(0,3fr)_auto] sm:gap-x-3">
      <span className="label-mono hidden pt-[11px] text-faint sm:block">{index + 1}</span>
      <AutoTextarea ref={term} value={row.term} onChange={(e) => onChange(row.id, 'term', e.target.value)} placeholder="Term" aria-label={`Term ${index + 1}`} className="sm:border-r sm:border-line sm:pr-3" />
      <AutoTextarea
        value={row.def}
        onChange={(e) => onChange(row.id, 'def', e.target.value)}
        onKeyDown={onDefKey}
        placeholder="Definition"
        aria-label={`Definition ${index + 1}`}
        className="col-start-1 row-start-2 border-t border-line text-muted focus:text-fg sm:col-start-3 sm:row-start-1 sm:border-t-0"
      />
      <button
        type="button"
        onClick={() => onRemove(row.id)}
        aria-label={`Remove card ${index + 1}`}
        tabIndex={-1}
        className={cx(btn({ variant: 'ghost', icon: true, size: 'sm' }), 'col-start-2 row-start-1 mt-0.5 text-faint sm:col-start-4')}
      >
        <Icon name="close" size={16} />
      </button>
    </li>
  );
});

/** Browsers that size a textarea to its content by themselves (`field-sizing`) need no script for it. */
const nativeSizing = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');

/** A textarea that is as tall as its text. */
function AutoTextarea({ ref, className, value, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  const own = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = own.current;
    if (!el || nativeSizing) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={(el) => {
        own.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      rows={1}
      value={value}
      className={cx('block field-sizing-content w-full resize-none bg-transparent py-2 text-[15px] leading-snug placeholder:text-faint', className)}
      {...rest}
    />
  );
}
