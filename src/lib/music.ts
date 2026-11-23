/**
 * Music during a game: one of Titan's built-in songs (lib/songs.ts), or one of the viewer's own
 * audio files. Those files never leave the device: they are kept in this browser's IndexedDB.
 */
import { audioContext, musicOutput, unlockAudio } from './audio';
import { SONGS, renderSong, songById } from './songs';
import { actions, getState } from './store';
import { uid } from './util';

// ---------- the viewer's own tracks (IndexedDB) ----------

const DB = 'titan';
const STORE = 'files';

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
export const OWN_TRACK_LIMIT = 12;

/** Add an audio file to the viewer's tracks and select it. Rejects when the browser can't play it. */
export async function addOwnTrack(file: File) {
  const { ownTracks } = getState().settings;
  if (ownTracks.length >= OWN_TRACK_LIMIT) throw new Error(`You can keep up to ${OWN_TRACK_LIMIT} of your own tracks. Remove one to add another.`);
  if (file.size > TRACK_MAX_BYTES) throw new Error('That file is over 30\u00a0MB. Choose a smaller one.');
  const seconds = await durationOf(file);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('This browser can’t play that file. Try an MP3 or WAV.');
  const id = `t${uid()}`;
  await idb('readwrite', (s) => s.put(file, id));
  actions.setSettings({ ownTracks: [...ownTracks, { id, name: file.name.replace(/\.[^.]+$/, '') }], track: `own:${id}` });
  retune();
}

export async function removeOwnTrack(id: string) {
  await idb('readwrite', (s) => s.delete(id)).catch(() => {});
  loaded.delete(`own:${id}`);
  const { ownTracks, track } = getState().settings;
  actions.setSettings({ ownTracks: ownTracks.filter((t) => t.id !== id), track: track === `own:${id}` ? SONGS[0].id : track });
  retune();
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

/** Loaded tracks by id ("orbit", "own:t1a2b3"). */
const loaded = new Map<string, Promise<Track>>();

async function loadOwn(id: string): Promise<Track> {
  const blob = await idb<Blob | undefined>('readonly', (s) => s.get(id));
  if (!blob) throw new Error('missing');
  const seconds = await durationOf(blob);
  if (!Number.isFinite(seconds)) throw new Error('unplayable');
  if (seconds <= DECODE_MAX_SECONDS) {
    try {
      // An offline context decodes without needing a tap first.
      const Ctor = window.OfflineAudioContext ?? (window as Window & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
      return { kind: 'buffer', buffer: await new Ctor(2, 1, 44_100).decodeAudioData(await blob.arrayBuffer()) };
    } catch {
      // fall through and stream it
    }
  }
  return { kind: 'stream', url: URL.createObjectURL(blob) };
}

function load(id: string): Promise<Track> {
  let job = loaded.get(id);
  if (!job) {
    const song = songById(id);
    job = song ? renderSong(song).then((buffer): Track => ({ kind: 'buffer', buffer })) : loadOwn(id.replace(/^own:/, ''));
    loaded.set(id, job);
    job.catch(() => loaded.delete(id));
  }
  return job;
}

/** Every track that can be chosen, built-in first. */
export function allTracks(): { id: string; name: string; mood?: string; own?: string }[] {
  return [...SONGS.map((s) => ({ id: s.id, name: s.name, mood: s.mood })), ...getState().settings.ownTracks.map((t) => ({ id: `own:${t.id}`, name: t.name, own: t.id }))];
}

let lastShuffled = '';

/** The track the next game should play: the chosen one, or a different one each time on shuffle. */
function nextTrack(): string {
  const { track } = getState().settings;
  if (track !== 'shuffle') return track;
  const ids = allTracks().map((t) => t.id);
  const pool = ids.length > 1 ? ids.filter((id) => id !== lastShuffled) : ids;
  lastShuffled = pool[Math.floor(Math.random() * pool.length)];
  return lastShuffled;
}

/** Get the music ready ahead of the first round, so it starts with the Start tap. */
export function prepareMusic() {
  const { music, track } = getState().settings;
  if (music && track !== 'shuffle') void load(track).catch(() => {});
}

// ---------- playback ----------

interface Playing {
  id: string;
  gain: GainNode;
  stop: (at: number) => void;
}

let playing: Playing | null = null;
/** What should be sounding: a game's music, a preview from Settings, or nothing. */
let want: { id: string; preview: boolean } | null = null;
/** Bumped on every change, so a slow load can tell it has been superseded. */
let ticket = 0;
const previewListeners = new Set<() => void>();

const FADE_IN = 0.25;

async function begin(id: string) {
  const mine = ++ticket;
  const c = audioContext();
  const out = musicOutput();
  if (!c || !out) return;
  unlockAudio();
  let track: Track;
  try {
    track = await load(id);
  } catch {
    // An own track that has gone missing: fall back to the first built-in song.
    if (id.startsWith('own:') && mine === ticket) void begin(SONGS[0].id);
    return;
  }
  if (mine !== ticket || !want || want.id !== id) return;
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
      id,
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
      id,
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

function setVolume() {
  const c = audioContext();
  const out = musicOutput();
  if (c && out) out.gain.setTargetAtTime(getState().settings.musicVolume, c.currentTime, 0.03);
}

/** A game started. Call from the tap or key press that starts it. */
export function startMusic() {
  setVolume();
  if (!getState().settings.music) {
    want = { id: '', preview: false };
    return;
  }
  want = { id: nextTrack(), preview: false };
  void begin(want.id);
}

/** The game ended or was left. */
export function stopMusic(fade = 0.5) {
  if (want?.preview) return;
  want = null;
  ticket++;
  halt(fade);
}

/** Settings changed: follow the on/off switch, the volume and the chosen track. */
export function syncMusic() {
  setVolume();
  retune();
}

/** While a game is running, make what plays match the settings. */
function retune() {
  if (!want || want.preview) return;
  const { music, track } = getState().settings;
  if (!music) {
    want.id = '';
    ticket++;
    halt(0.2);
    return;
  }
  const id = track === 'shuffle' ? want.id || nextTrack() : track;
  if (playing?.id === id) return;
  want.id = id;
  halt(0.15);
  void begin(id);
}

// ---------- previews (Settings) ----------

/** The track being previewed, if any. */
export const previewing = () => (want?.preview ? want.id : null);

export function subscribePreview(l: () => void) {
  previewListeners.add(l);
  return () => void previewListeners.delete(l);
}

/** Play a track from Settings to hear it; calling again with the same track stops it. */
export function togglePreview(id: string) {
  if (want?.preview && want.id === id) return stopPreview();
  setVolume();
  want = { id, preview: true };
  void begin(id);
  previewListeners.forEach((l) => l());
}

export function stopPreview() {
  if (!want?.preview) return;
  want = null;
  ticket++;
  halt(0.2);
  previewListeners.forEach((l) => l());
}
