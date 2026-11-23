import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Button from './Button';
import { Choice, Field, Switch } from './Controls';
import Icon from './Icon';
import { Dialog } from './Modal';
import { toast, toastError } from './Toast';
import { PAIR_CHOICES, actions, exportBackup, useStore, type Settings, type ThemePref } from '../lib/store';
import { OWN_TRACK_LIMIT, addOwnTrack, allTracks, previewing, removeOwnTrack, stopPreview, subscribePreview, syncMusic, togglePreview } from '../lib/music';
import { sfx, unlockAudio } from '../lib/audio';
import { cx, download, plural } from '../lib/util';

const THEMES: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const setCount = useStore((s) => s.sets.length);
  const trackInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const playingPreview = useSyncExternalStore(subscribePreview, previewing);

  // A preview never outlives the dialog.
  useEffect(() => stopPreview, []);

  const set = (patch: Partial<Settings>) => {
    actions.setSettings(patch);
    syncMusic();
  };

  const addTrack = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      await addOwnTrack(file);
      toast(`Added “${file.name}”`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Couldn’t add that file. Try a different audio file.');
    } finally {
      setBusy(false);
    }
  };

  const restore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const count = actions.importBackup(JSON.parse(await file.text()));
      if (count) toast(`Restored ${plural(count, 'set')}`);
      else toastError('No sets in that file. Choose the .json file from Download backup.');
    } catch {
      toastError('That file isn’t a Titan backup. Choose the .json file from Download backup.');
    }
  };

  const tracks = allTracks();

  // The track list is one radio group: arrow keys move the choice, and focus goes with it.
  const onTrackKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step || !(e.target as HTMLElement).matches('[role="radio"]')) return;
    e.preventDefault();
    const ids = [...tracks.map((t) => t.id), 'shuffle'];
    const next = ids[(ids.indexOf(settings.track) + step + ids.length) % ids.length];
    set({ track: next });
    const group = e.currentTarget;
    requestAnimationFrame(() => group.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus());
  };

  return (
    <Dialog title="Settings" onClose={onClose}>
      <div className="divide-y divide-line">
        <Field title="Appearance" stack>
          <Choice label="Appearance" value={settings.theme} onChange={(theme) => set({ theme })} options={THEMES} />
        </Field>

        <Field title="Pairs per board" hint="Eight pairs make a 4 × 4 board. Fewer leave more room for long definitions." stack>
          <Choice label="Pairs per board" value={settings.pairs} onChange={(pairs) => set({ pairs })} options={PAIR_CHOICES.map((n) => ({ value: n, label: String(n) }))} />
        </Field>

        <Field title="Single-key shortcuts" hint="Keys like N, M and W A S D. Switch them off if stray key presses get in the way; Enter, Esc, the arrows and Ctrl or ⌘ shortcuts stay.">
          <Switch label="Single-key shortcuts" checked={settings.shortcuts} onChange={(shortcuts) => set({ shortcuts })} />
        </Field>

        <Field title="Sound effects">
          <Switch
            label="Sound effects"
            checked={settings.sfx}
            onChange={(on) => {
              set({ sfx: on });
              if (on) sfx('match', 2);
            }}
          />
        </Field>

        <div>
          <Field title="Music" hint="Plays during a game of Match.">
            <Switch
              label="Music"
              checked={settings.music}
              onChange={(music) => {
                if (!music) stopPreview();
                set({ music });
              }}
            />
          </Field>
          {/* Opens and closes smoothly, so the dialog doesn't jump when music is switched. */}
          <AnimatePresence initial={false}>
            {settings.music && (
              <m.div
                key="music"
                className="overflow-hidden"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1, transition: { type: 'spring', duration: 0.3, bounce: 0 } }}
                exit={{ height: 0, opacity: 0, transition: { duration: 0.15, ease: 'easeOut' } }}
              >
                <div className="space-y-4 pb-4">
                  <label className="flex items-center gap-4">
                    <span className="w-16 shrink-0 text-caption text-muted">Volume</span>
                    <input type="range" min={0} max={1} step={0.05} value={settings.musicVolume} aria-valuetext={`${Math.round(settings.musicVolume * 100)}%`} onChange={(e) => set({ musicVolume: Number(e.target.value) })} className="h-6 min-w-0 flex-1" />
                  </label>

                  <div role="radiogroup" aria-label="Track" onKeyDown={onTrackKey} className="overflow-hidden rounded-2xl border border-line">
                    {tracks.map((t) => (
                      <TrackRow
                        key={t.id}
                        name={t.name}
                        note={t.mood ?? 'Your file'}
                        selected={settings.track === t.id}
                        previewing={playingPreview === t.id}
                        onSelect={() => set({ track: t.id })}
                        onPreview={() => {
                          unlockAudio();
                          togglePreview(t.id);
                        }}
                        onRemove={t.own ? () => void removeOwnTrack(t.own!) : undefined}
                      />
                    ))}
                    <TrackRow name="Shuffle" note="A different track every game" selected={settings.track === 'shuffle'} onSelect={() => set({ track: 'shuffle' })} />
                  </div>

                  <input ref={trackInput} type="file" accept="audio/*" hidden onChange={(e) => (void addTrack(e.target.files?.[0]), (e.target.value = ''))} />
                  <div className="flex items-center gap-3">
                    <Button size="sm" disabled={busy || settings.ownTracks.length >= OWN_TRACK_LIMIT} onClick={() => trackInput.current?.click()}>
                      <Icon name="plus" size={14} stroke={2} />
                      {busy ? 'Adding track…' : 'Add your own track'}
                    </Button>
                    <p className="text-caption text-pretty text-faint">Any audio file up to 30&nbsp;MB, {OWN_TRACK_LIMIT} at most. It stays in this browser and is never uploaded.</p>
                  </div>
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>

        <Field title="Backup" hint="Sets and progress are saved in this browser. Download a copy to move them or keep them safe." stack>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!setCount} onClick={() => download(`titan-backup-${new Date().toISOString().slice(0, 10)}.json`, exportBackup(), 'application/json')}>
              <Icon name="download" size={14} stroke={2} />
              Download backup
            </Button>
            <input ref={backupInput} type="file" accept=".json,application/json" hidden onChange={(e) => (void restore(e.target.files?.[0]), (e.target.value = ''))} />
            <Button size="sm" onClick={() => backupInput.current?.click()}>
              Restore from file
            </Button>
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

function TrackRow({
  name,
  note,
  selected,
  previewing: isPreviewing,
  onSelect,
  onPreview,
  onRemove,
}: {
  name: string;
  note: string;
  selected: boolean;
  previewing?: boolean;
  onSelect: () => void;
  onPreview?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className={cx('flex items-center gap-1 border-b border-line pr-2 pl-1.5 transition-[color,background-color,border-color] duration-150 ease-out last:border-b-0', selected && 'bg-fg/[0.06]')}>
      {onPreview ? (
        <button
          type="button"
          onClick={onPreview}
          aria-label={isPreviewing ? `Stop ${name}` : `Listen to ${name}`}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-[color,background-color,scale] duration-150 ease-out hover:bg-fg/[0.08] hover:text-fg not-disabled:active:scale-[0.96]"
        >
          <Icon name={isPreviewing ? 'stop' : 'play'} size={13} />
        </button>
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center text-muted">
          <Icon name="shuffle" size={15} />
        </span>
      )}
      <button type="button" role="radio" aria-checked={selected} tabIndex={selected ? 0 : -1} onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-2.5 pl-1 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm" title={name}>
            {name}
          </span>
          <span className="block truncate text-caption text-muted">{note}</span>
        </span>
        <Icon name="check" size={16} className={cx('transition-opacity duration-150', selected ? 'opacity-100' : 'opacity-0')} />
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-faint transition-[color,background-color,scale] duration-150 ease-out hover:bg-fg/[0.08] hover:text-fg not-disabled:active:scale-[0.96]"
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}
