/**
 * Music during a round. Plays Titan's built-in theme (lib/theme.ts), or the viewer's own audio
 * file when they picked one in Settings. That file never leaves the device: it is kept in this
 * browser's IndexedDB.
 */
import { audioContext, musicOutput, unlockAudio } from './audio';
import { renderTheme } from './theme';
import { actions, getState } from './store';

// ---------- the viewer's own track (IndexedDB) ----------

const DB = 'titan';
const STORE = 'files';
const TRACK_KEY = 'music';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = d.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    d.close();
  }
}

/** Longest track that is decoded whole (which loops with no gap). Longer ones are streamed. */
const DECODE_MAX_SECONDS = 150;
export const TRACK_MAX_BYTES = 30 * 1024 * 1024;

/** Keep an audio file as the game's music. Rejects when the browser can't play it. */
export async function saveCustomTrack(file: File) {
  if (file.size > TRACK_MAX_BYTES) throw new Error('That file is too large (30 MB at most).');
  const seconds = await durationOf(file);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("This browser can't play that file.");
  await idb('readwrite', (s) => s.put(file, TRACK_KEY));
  loaded = null;
  actions.setSettings({ customTrack: file.name });
  restartIfPlaying();
}

/** Go back to the built-in theme. */
export async function removeCustomTrack() {
  await idb('readwrite', (s) => s.delete(TRACK_KEY)).catch(() => {});
  loaded = null;
  actions.setSettings({ customTrack: null });
  restartIfPlaying();
}

function durationOf(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const probe = new Audio();
    const done = (v: number) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => done(probe.duration);
    probe.onerror = () => done(NaN);
    probe.src = url;
  });
}

// ---------- loading ----------

type Track = { kind: 'buffer'; buffer: AudioBuffer } | { kind: 'stream'; url: string };

let loaded: { custom: string | null; track: Promise<Track> } | null = null;

async function loadCustom(): Promise<Track | null> {
  const blob = await idb<Blob | undefined>('readonly', (s) => s.get(TRACK_KEY)).catch(() => undefined);
  if (!blob) return null;
  const seconds = await durationOf(blob);
  if (!Number.isFinite(seconds)) return null;
  if (seconds <= DECODE_MAX_SECONDS) {
    try {
      // An offline context decodes without needing a tap first.
      const Ctor = window.OfflineAudioContext ?? (window as Window & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
      const buffer = await new Ctor(2, 1, 44_100).decodeAudioData(await blob.arrayBuffer());
      return { kind: 'buffer', buffer };
    } catch {
      // fall through and stream it
    }
  }
  return { kind: 'stream', url: URL.createObjectURL(blob) };
}

function load(): Promise<Track> {
  const custom = getState().settings.customTrack;
  if (loaded && loaded.custom === custom) return loaded.track;
  const track = (async (): Promise<Track> => {
    if (custom) {
      const own = await loadCustom();
      if (own) return own;
    }
    return { kind: 'buffer', buffer: await renderTheme() };
  })();
  loaded = { custom, track };
  track.catch(() => {
    if (loaded?.track === track) loaded = null;
  });
  return track;
}

/** Get the music ready ahead of the first round, so it starts on the beat of the Start tap. */
export function prepareMusic() {
  if (getState().settings.music) void load().catch(() => {});
}

// ---------- playback ----------

interface Playing {
  gain: GainNode;
  stop: (at: number) => void;
}

let playing: Playing | null = null;
/** A round is running, so music should play whenever the setting is on. */
let wanted = false;
/** Bumped on every start/stop, so a slow load can tell it has been superseded. */
let ticket = 0;

const FADE_IN = 0.25;

async function begin() {
  const mine = ++ticket;
  const c = audioContext();
  const out = musicOutput();
  if (!c || !out) return;
  unlockAudio();
  let track: Track;
  try {
    track = await load();
  } catch {
    return;
  }
  if (mine !== ticket || !wanted || !getState().settings.music) return;
  halt(0);

  const gain = c.createGain();
  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.linearRampToValueAtTime(1, c.currentTime + FADE_IN);
  gain.connect(out);

  if (track.kind === 'buffer') {
    const src = c.createBufferSource();
    src.buffer = track.buffer;
    src.loop = true;
    src.connect(gain);
    src.start();
    playing = {
      gain,
      stop: (at) => {
        try {
          src.stop(at);
        } catch {
          // already stopped
        }
        src.onended = () => gain.disconnect();
      },
    };
  } else {
    const el = new Audio(track.url);
    el.loop = true;
    const node = c.createMediaElementSource(el);
    node.connect(gain);
    void el.play().catch(() => {});
    playing = {
      gain,
      stop: (at) => {
        window.setTimeout(() => {
          el.pause();
          node.disconnect();
          gain.disconnect();
        }, Math.max(0, at - c.currentTime) * 1000 + 30);
      },
    };
  }
}

function halt(fade: number) {
  const c = audioContext();
  if (!playing || !c) return;
  const { gain, stop } = playing;
  playing = null;
  const now = c.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + fade);
  stop(now + fade + 0.02);
}

function restartIfPlaying() {
  if (!wanted) return;
  halt(0.15);
  if (getState().settings.music) void begin();
}

/** A round started. Call from the tap or key press that starts it. */
export function startMusic() {
  wanted = true;
  const c = audioContext();
  const out = musicOutput();
  if (c && out) out.gain.setValueAtTime(getState().settings.musicVolume, c.currentTime);
  if (getState().settings.music) void begin();
}

/** The round ended or was left. */
export function stopMusic(fade = 0.5) {
  wanted = false;
  ticket++;
  halt(fade);
}

/** Settings changed: follow the on/off switch and the volume. */
export function syncMusic() {
  const { music, musicVolume } = getState().settings;
  const c = audioContext();
  const out = musicOutput();
  if (c && out) out.gain.setTargetAtTime(musicVolume, c.currentTime, 0.03);
  if (!wanted) return;
  if (music && !playing) void begin();
  else if (!music && playing) {
    ticket++;
    halt(0.2);
  }
}
