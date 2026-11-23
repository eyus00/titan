import { useRef, useState } from 'react';
import Button from './Button';
import { Choice, Field, Switch } from './Controls';
import { Dialog } from './Modal';
import { toast } from './Toast';
import { PAIR_CHOICES, actions, exportBackup, useStore, type ThemePref } from '../lib/store';
import { removeCustomTrack, saveCustomTrack, syncMusic } from '../lib/music';
import { sfx } from '../lib/audio';
import { download, plural } from '../lib/util';

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

  const set = (patch: Parameters<typeof actions.setSettings>[0]) => {
    actions.setSettings(patch);
    syncMusic();
  };

  const chooseTrack = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      await saveCustomTrack(file);
      toast(`Now playing “${file.name}” during rounds`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't use that file.");
    } finally {
      setBusy(false);
    }
  };

  const restore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const count = actions.importBackup(JSON.parse(await file.text()));
      toast(count ? `Restored ${plural(count, 'set')}` : 'No sets found in that file.');
    } catch {
      toast("That file isn't a Titan backup.");
    }
  };

  return (
    <Dialog title="Settings" onClose={onClose}>
      <div className="divide-y divide-line">
        <Field title="Appearance" stack>
          <Choice label="Appearance" value={settings.theme} onChange={(theme) => set({ theme })} options={THEMES} />
        </Field>

        <Field title="Pairs per round" hint="Fewer pairs leave more room for long definitions." stack>
          <Choice label="Pairs per round" value={settings.pairs} onChange={(pairs) => set({ pairs })} options={PAIR_CHOICES.map((n) => ({ value: n, label: String(n) }))} />
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
          <Field title="Music" hint="Plays while a round is running.">
            <Switch label="Music" checked={settings.music} onChange={(music) => set({ music })} />
          </Field>
          {settings.music && (
            <div className="space-y-4 pb-4">
              <label className="flex items-center gap-4">
                <span className="w-16 shrink-0 text-[13px] text-muted">Volume</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.musicVolume}
                  onChange={(e) => set({ musicVolume: Number(e.target.value) })}
                  className="h-6 min-w-0 flex-1"
                />
              </label>
              <div className="flex items-center gap-4">
                <span className="w-16 shrink-0 text-[13px] text-muted">Track</span>
                <span className="min-w-0 flex-1 truncate text-sm">{settings.customTrack ?? 'Titan theme'}</span>
                <input ref={trackInput} type="file" accept="audio/*" hidden onChange={(e) => (void chooseTrack(e.target.files?.[0]), (e.target.value = ''))} />
                {settings.customTrack && (
                  <Button size="sm" variant="ghost" onClick={() => void removeCustomTrack()}>
                    Reset
                  </Button>
                )}
                <Button size="sm" disabled={busy} onClick={() => trackInput.current?.click()}>
                  {busy ? 'Loading…' : 'Use my own'}
                </Button>
              </div>
              <p className="text-[13px] text-pretty text-faint">Your own track is kept in this browser only. It is never uploaded.</p>
            </div>
          )}
        </div>

        <Field title="Backup" hint="Sets are saved in this browser. Download a copy to move them or keep them safe." stack>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!setCount} onClick={() => download(`titan-backup-${new Date().toISOString().slice(0, 10)}.json`, exportBackup(), 'application/json')}>
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
