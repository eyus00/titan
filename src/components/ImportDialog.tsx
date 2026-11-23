import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { FileUp } from 'lucide-react';
import Button from './Button';
import { Choice } from './Controls';
import { Dialog } from './Modal';
import { toast } from './Toast';
import { CARD_SEPS, DEFAULT_OPTIONS, TERM_SEPS, detect, parseList, placeholder, type ParseOptions, type ParsedCard } from '../lib/parse';
import { cx, plural } from '../lib/util';

const PREVIEW_MAX = 60;
const FILE_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Paste (or drop) a list and turn it into cards. The separators are guessed from the text
 * until one is picked by hand; the preview shows exactly what will be imported.
 */
export default function ImportDialog({ onImport, onClose }: { onImport: (cards: ParsedCard[], fileName?: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const [opts, setOpts] = useState<ParseOptions>(DEFAULT_OPTIONS);
  /** Still guessing the separators (off once the user chooses one). */
  const [auto, setAuto] = useState(true);
  const [fileName, setFileName] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const cards = useMemo(() => parseList(text, opts), [text, opts]);
  const incomplete = cards.filter((c) => !c.term || !c.def).length;

  const change = (next: string) => {
    setText(next);
    if (auto) setOpts((o) => ({ ...o, ...detect(next) }));
  };

  const pick = (patch: Partial<ParseOptions>) => {
    setAuto(false);
    setOpts((o) => ({ ...o, ...patch }));
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > FILE_MAX_BYTES) return toast('That file is too large to import.');
    const content = await file.text();
    if (content.includes('\u0000')) return toast("That doesn't look like a text file.");
    setFileName(file.name.replace(/\.[^.]+$/, ''));
    change(content);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void readFile(e.dataTransfer.files[0]);
  };

  // Tab types a tab, since tab is the usual separator and can't be typed otherwise.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: a, selectionEnd: b } = el;
    const next = text.slice(0, a) + '\t' + text.slice(b);
    change(next);
    requestAnimationFrame(() => el.setSelectionRange(a + 1, a + 1));
  };

  return (
    <Dialog
      title="Import a list"
      subtitle="Paste your words and definitions, or drop in a text or CSV file."
      wide
      onClose={onClose}
      footer={
        <>
          <span className="label-mono mr-auto min-w-0 truncate text-muted">
            {cards.length ? plural(cards.length, 'card') : 'nothing to import yet'}
            {incomplete > 0 && <span className="text-bad"> · {incomplete} incomplete</span>}
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!cards.length} onClick={() => onImport(cards, fileName)}>
            Import{cards.length ? ` ${cards.length}` : ''}
          </Button>
        </>
      }
    >
      <div
        className="relative"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <textarea
          autoFocus
          value={text}
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder(opts)}
          spellCheck={false}
          aria-label="Your list"
          className={cx(
            'block h-44 w-full resize-y rounded-2xl border bg-bg px-4 py-3 font-mono text-[13px] leading-relaxed whitespace-pre text-fg transition-colors placeholder:text-faint',
            dragging ? 'border-fg' : 'border-line focus:border-fg/40',
          )}
        />
        <input ref={fileInput} type="file" accept=".txt,.csv,.tsv,.md,text/*" hidden onChange={(e) => (void readFile(e.target.files?.[0]), (e.target.value = ''))} />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="label-mono absolute right-2.5 bottom-2.5 inline-flex h-7 items-center gap-1.5 rounded-full bg-surface px-2.5 text-muted ring-1 ring-line transition-colors hover:text-fg"
        >
          <FileUp className="size-3.5" strokeWidth={1.75} />
          open file
        </button>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Separator
          title="Between term and definition"
          value={opts.termSep}
          options={TERM_SEPS}
          custom={opts.termCustom}
          onPick={(termSep) => pick({ termSep })}
          onCustom={(termCustom) => pick({ termSep: 'custom', termCustom })}
        />
        <Separator
          title="Between cards"
          value={opts.cardSep}
          options={CARD_SEPS}
          custom={opts.cardCustom}
          onPick={(cardSep) => pick({ cardSep })}
          onCustom={(cardCustom) => pick({ cardSep: 'custom', cardCustom })}
        />
      </div>

      <div className="mt-6">
        <div className="label-mono mb-2 flex items-baseline justify-between text-muted">
          <span>preview</span>
          {auto && text.trim() !== '' && <span className="text-faint">separators detected automatically</span>}
        </div>
        {cards.length ? (
          <ol className="overflow-hidden rounded-2xl border border-line">
            {cards.slice(0, PREVIEW_MAX).map((c, i) => (
              <li key={i} className="grid grid-cols-[2rem_minmax(0,2fr)_minmax(0,3fr)] gap-3 border-b border-line px-3.5 py-2.5 text-sm last:border-b-0">
                <span className="label-mono pt-0.5 text-faint">{i + 1}</span>
                <span className={cx('break-words whitespace-pre-line', !c.term && 'text-bad')}>{c.term || 'no term'}</span>
                <span className={cx('break-words whitespace-pre-line', c.def ? 'text-muted' : 'text-bad')}>{c.def || 'no definition'}</span>
              </li>
            ))}
            {cards.length > PREVIEW_MAX && <li className="label-mono px-3.5 py-2.5 text-faint">and {cards.length - PREVIEW_MAX} more</li>}
          </ol>
        ) : (
          <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-faint">Your cards will show up here.</p>
        )}
      </div>
    </Dialog>
  );
}

function Separator<T extends string>({
  title,
  value,
  options,
  custom,
  onPick,
  onCustom,
}: {
  title: string;
  value: T;
  options: { id: T; label: string }[];
  custom: string;
  onPick: (id: T) => void;
  onCustom: (text: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-[13px] text-muted">{title}</div>
      <Choice label={title} value={value} onChange={onPick} options={options.map((o) => ({ value: o.id, label: o.label }))} />
      {value === 'custom' && (
        <input
          autoFocus
          value={custom}
          onChange={(e) => onCustom(e.target.value)}
          placeholder="e.g.  ->  or \n for a new line"
          aria-label={`Custom separator: ${title}`}
          spellCheck={false}
          className="mt-2 h-9 w-full rounded-full border border-line bg-bg px-3.5 font-mono text-[13px] placeholder:text-faint focus:border-fg/40"
        />
      )}
    </div>
  );
}
