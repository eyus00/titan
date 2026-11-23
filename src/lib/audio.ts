/**
 * Sound effects, synthesized with Web Audio: no files to download, and they play the instant
 * a card is touched. One AudioContext for the whole app, created on the first tap or key press
 * (browsers only allow sound after one).
 */
import { getState } from './store';

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

/** The shared context, created on demand. Null where Web Audio is missing. */
export function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.9;
  sfxBus.connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = getState().settings.musicVolume;
  musicBus.connect(ctx.destination);
  return ctx;
}

/** Where music connects; its gain is the music volume. */
export function musicOutput(): GainNode | null {
  audioContext();
  return musicBus;
}

/** Call from a tap or key handler: wakes the context (it starts suspended until a gesture). */
export function unlockAudio() {
  const c = audioContext();
  if (c && c.state !== 'running' && !document.hidden) void c.resume().catch(() => {});
}

// Any first interaction unlocks sound, so the first card tap is already audible.
if (typeof window !== 'undefined') {
  const wake = () => unlockAudio();
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('keydown', wake);
  // Nothing should keep playing in a hidden tab.
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend().catch(() => {});
    else void ctx.resume().catch(() => {});
  });
}

// ---------- building blocks ----------

interface Tone {
  type?: OscillatorType;
  freq: number;
  /** Glide to this frequency over the note. */
  to?: number;
  /** Seconds from now. */
  at?: number;
  dur: number;
  gain: number;
  attack?: number;
}

function tone(c: AudioContext, out: AudioNode, { type = 'sine', freq, to, at = 0, dur, gain, attack = 0.004 }: Tone) {
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(env).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

/** A struck, glassy note: the fundamental plus two quieter, shorter overtones. */
function bell(c: AudioContext, out: AudioNode, freq: number, at: number, dur: number, gain: number) {
  tone(c, out, { freq, at, dur, gain });
  tone(c, out, { freq: freq * 2, at, dur: dur * 0.6, gain: gain * 0.3 });
  tone(c, out, { freq: freq * 3.01, at, dur: dur * 0.35, gain: gain * 0.1 });
}

function noise(c: AudioContext, out: AudioNode, at: number, dur: number, gain: number, filter: BiquadFilterType, freq: number) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const t0 = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  const env = c.createGain();
  env.gain.setValueAtTime(gain, t0);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(env).connect(out);
  src.start(t0, Math.random() * 0.9);
  src.stop(t0 + dur + 0.02);
}

// ---------- the sounds ----------

/** C major pentatonic, rising: each match in a round rings one step higher than the last. */
const LADDER = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];

const SOUNDS = {
  /** Picking a card up. */
  tap(c: AudioContext, out: AudioNode) {
    tone(c, out, { freq: 620, to: 840, dur: 0.07, gain: 0.16 });
    noise(c, out, 0, 0.018, 0.05, 'highpass', 3200);
  },
  /** Putting it back down. */
  untap(c: AudioContext, out: AudioNode) {
    tone(c, out, { freq: 560, to: 400, dur: 0.08, gain: 0.12 });
  },
  /** A correct pair. `step` = how many pairs are already matched. */
  match(c: AudioContext, out: AudioNode, step = 0) {
    const f = LADDER[Math.min(step, LADDER.length - 1)];
    bell(c, out, f, 0, 0.34, 0.2);
    bell(c, out, f * 1.5, 0.075, 0.46, 0.17);
  },
  /** A wrong pair: two soft falling knocks. */
  miss(c: AudioContext, out: AudioNode) {
    tone(c, out, { type: 'triangle', freq: 196, to: 150, dur: 0.11, gain: 0.24 });
    tone(c, out, { type: 'triangle', freq: 150, to: 104, at: 0.1, dur: 0.2, gain: 0.24 });
    tone(c, out, { freq: 98, dur: 0.24, gain: 0.12 });
  },
  /** Round begins. */
  start(c: AudioContext, out: AudioNode) {
    bell(c, out, 392.0, 0, 0.2, 0.15);
    bell(c, out, 523.25, 0.08, 0.2, 0.15);
    bell(c, out, 783.99, 0.16, 0.45, 0.17);
  },
  /** Cards landing on the table, one tick each. */
  deal(c: AudioContext, out: AudioNode, count = 12) {
    for (let i = 0; i < count; i++) {
      const at = i * 0.028;
      noise(c, out, at, 0.024, 0.06, 'bandpass', 2200 + Math.random() * 900);
      tone(c, out, { freq: 300 + i * 14, at, dur: 0.035, gain: 0.035 });
    }
  },
  /** The keyboard cursor stepping to another card: barely there. */
  move(c: AudioContext, out: AudioNode) {
    tone(c, out, { freq: 900, dur: 0.03, gain: 0.03 });
  },
  /** A flashcard turning over. */
  flip(c: AudioContext, out: AudioNode) {
    noise(c, out, 0, 0.07, 0.035, 'bandpass', 1400);
    tone(c, out, { freq: 330, to: 520, dur: 0.08, gain: 0.07 });
  },
  /** Flashcard marked as known. */
  know(c: AudioContext, out: AudioNode) {
    bell(c, out, 659.25, 0, 0.26, 0.13);
    bell(c, out, 987.77, 0.06, 0.34, 0.11);
  },
  /** Flashcard marked for another pass: neutral, not a scolding. */
  again(c: AudioContext, out: AudioNode) {
    tone(c, out, { type: 'triangle', freq: 300, to: 240, dur: 0.14, gain: 0.14 });
  },
  /** Board cleared. */
  win(c: AudioContext, out: AudioNode) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(c, out, f, i * 0.09, 0.5, 0.16));
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => bell(c, out, f, 0.38, 1.1, 0.07));
  },
  /** Board cleared in a new best time: the win, plus a sparkle on top. */
  best(c: AudioContext, out: AudioNode) {
    SOUNDS.win(c, out);
    [1318.51, 1567.98, 2093.0].forEach((f, i) => bell(c, out, f, 0.5 + i * 0.08, 0.7, 0.1));
  },
} as const;

export type Sfx = keyof typeof SOUNDS;

/** Play a sound effect (does nothing while effects are switched off). */
export function sfx(name: Sfx, arg?: number) {
  if (!getState().settings.sfx) return;
  const c = audioContext();
  if (!c || !sfxBus) return;
  unlockAudio();
  try {
    SOUNDS[name](c, sfxBus, arg);
  } catch {
    // a sound failing must never break the game
  }
}
