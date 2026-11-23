/**
 * Titan's built-in music: short original loops, written as notes and rendered to audio in the
 * browser the first time each is needed. Nothing to download, and every loop point is exact,
 * so the music repeats without a gap.
 *
 * To change a tune, edit its entry in SONGS: `bars` is the harmony, `lead` the melody.
 * Notes are MIDI numbers (60 = middle C). Steps are sixteenth notes, 16 to a bar.
 */

type ChordVoice = 'marimba' | 'pluck' | 'keys' | 'bell';

interface Bar {
  bass: number;
  /** Four chord notes, low to high: used by the arpeggio, the stabs and (an octave down) the pad. */
  chord: [number, number, number, number];
}

export interface Song {
  id: string;
  name: string;
  /** A few words for the track list. */
  mood: string;
  /** One sixteenth note in samples at 44.1 kHz (a whole number, so the loop length is exact). */
  step: number;
  /** How late the off-beat sixteenths land, as a share of a step. */
  swing?: number;
  bars: Bar[];
  /** For each of the 16 steps: which chord note sounds (0-3), or -1 for a rest. */
  arp?: { steps: number[]; voice: ChordVoice; level: number; octave?: number };
  /** Steps on which the whole chord is struck. */
  stabs?: { steps: number[]; voice: ChordVoice; level: number };
  /** [step, length in steps, semitones above the bar's bass note] */
  bass: { notes: [number, number, number][]; voice: 'round' | 'pluck'; level: number };
  pad?: number;
  /** [bar, step, MIDI note, length in steps] */
  lead?: { notes: [number, number, number, number][]; voice: 'glass' | 'soft' | 'square'; level: number };
  drums?: { kick: number[]; kickAlt?: number[]; snare: number[]; hat: number[]; accent?: number[] };
  /** How much of the tuned parts goes to the echo, 0..1. */
  echo: number;
}

const EVENS = [0, 2, 4, 6, 8, 10, 12, 14];

export const SONGS: Song[] = [
  {
    id: 'orbit',
    name: 'Orbit',
    mood: 'Bright marimba, light drums',
    step: 6000, // about 110 bpm
    // Cmaj7, Am7, Fmaj7, G6, Cmaj7, Em7, Fmaj7, G
    bars: [
      { bass: 36, chord: [60, 64, 67, 71] },
      { bass: 45, chord: [57, 60, 64, 67] },
      { bass: 41, chord: [57, 60, 64, 69] },
      { bass: 43, chord: [55, 59, 62, 64] },
      { bass: 36, chord: [60, 64, 67, 71] },
      { bass: 40, chord: [55, 59, 62, 64] },
      { bass: 41, chord: [57, 60, 64, 69] },
      { bass: 43, chord: [55, 59, 62, 67] },
    ],
    arp: { steps: [0, -1, 2, -1, 1, -1, 2, -1, 3, -1, 2, -1, 1, -1, 2, -1], voice: 'marimba', level: 0.13 },
    bass: { notes: [[0, 6, 0], [6, 6, 0], [12, 4, 7]], voice: 'round', level: 0.3 },
    pad: 0.04,
    lead: {
      voice: 'glass',
      level: 0.13,
      notes: [
        [0, 0, 67, 3], [0, 3, 72, 3], [0, 6, 76, 6],
        [1, 0, 74, 3], [1, 3, 72, 3], [1, 6, 69, 6],
        [2, 0, 69, 3], [2, 3, 72, 3], [2, 6, 76, 4], [2, 10, 74, 2], [2, 12, 72, 4],
        [3, 0, 74, 6], [3, 8, 71, 4], [3, 12, 67, 4],
        [4, 0, 67, 3], [4, 3, 72, 3], [4, 6, 76, 4], [4, 10, 79, 6],
        [5, 0, 76, 3], [5, 3, 74, 3], [5, 6, 71, 6], [5, 12, 74, 4],
        [6, 0, 72, 3], [6, 3, 69, 3], [6, 6, 72, 4], [6, 10, 76, 2], [6, 12, 77, 4],
        [7, 0, 74, 6], [7, 8, 76, 2], [7, 10, 74, 2], [7, 12, 71, 4],
      ],
    },
    drums: { kick: [0, 8], kickAlt: [0, 8, 14], snare: [4, 12], hat: EVENS, accent: [2, 6, 10, 14] },
    echo: 0.22,
  },
  {
    id: 'drift',
    name: 'Drift',
    mood: 'Slow and mellow, soft keys',
    step: 7875, // 84 bpm
    swing: 0.16,
    // Fmaj9, Dm7, Gm7, C7sus, Fmaj9, Am7, Bbmaj7, C7
    bars: [
      { bass: 41, chord: [57, 60, 64, 67] },
      { bass: 38, chord: [57, 60, 62, 65] },
      { bass: 43, chord: [58, 62, 65, 67] },
      { bass: 48, chord: [58, 60, 65, 67] },
      { bass: 41, chord: [57, 60, 64, 67] },
      { bass: 45, chord: [55, 60, 64, 67] },
      { bass: 46, chord: [58, 62, 65, 69] },
      { bass: 48, chord: [58, 60, 64, 67] },
    ],
    stabs: { steps: [0, 10], voice: 'keys', level: 0.085 },
    arp: { steps: [-1, -1, -1, -1, 3, -1, -1, 2, -1, -1, -1, -1, -1, -1, 3, -1], voice: 'bell', level: 0.045, octave: 12 },
    bass: { notes: [[0, 7, 0], [10, 3, 0], [13, 3, 7]], voice: 'round', level: 0.3 },
    pad: 0.035,
    lead: {
      voice: 'soft',
      level: 0.1,
      notes: [
        [0, 4, 72, 4], [0, 10, 69, 6],
        [1, 4, 74, 3], [1, 8, 72, 3], [1, 12, 69, 4],
        [2, 2, 74, 4], [2, 8, 70, 6],
        [3, 4, 72, 4], [3, 10, 67, 6],
        [4, 4, 72, 3], [4, 8, 76, 2], [4, 10, 77, 6],
        [5, 4, 76, 4], [5, 10, 72, 6],
        [6, 2, 74, 4], [6, 8, 77, 3], [6, 12, 74, 4],
        [7, 4, 72, 4], [7, 10, 76, 6],
      ],
    },
    drums: { kick: [0, 10], kickAlt: [0, 7, 10], snare: [4, 12], hat: [0, 2, 3, 4, 6, 8, 10, 11, 12, 14] },
    echo: 0.28,
  },
  {
    id: 'pulse',
    name: 'Pulse',
    mood: 'Fast and driving, for speed runs',
    step: 5250, // 126 bpm
    // Am, F, C, G, Am, F, Dm, Em
    bars: [
      { bass: 45, chord: [57, 60, 64, 69] },
      { bass: 41, chord: [57, 60, 65, 69] },
      { bass: 48, chord: [55, 60, 64, 67] },
      { bass: 43, chord: [55, 59, 62, 67] },
      { bass: 45, chord: [57, 60, 64, 69] },
      { bass: 41, chord: [57, 60, 65, 69] },
      { bass: 50, chord: [57, 62, 65, 69] },
      { bass: 40, chord: [55, 59, 64, 67] },
    ],
    arp: { steps: [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 1, 2, 3], voice: 'pluck', level: 0.075 },
    bass: { notes: [[0, 2, 0], [2, 2, 12], [4, 2, 0], [6, 2, 12], [8, 2, 0], [10, 2, 12], [12, 2, 0], [14, 2, 7]], voice: 'pluck', level: 0.24 },
    pad: 0.03,
    lead: {
      voice: 'square',
      level: 0.06,
      notes: [
        [0, 0, 76, 4], [0, 6, 72, 2], [0, 8, 69, 6],
        [1, 0, 77, 4], [1, 6, 72, 2], [1, 8, 69, 6],
        [2, 0, 79, 4], [2, 6, 76, 2], [2, 8, 72, 6],
        [3, 0, 74, 4], [3, 6, 71, 2], [3, 8, 74, 4], [3, 12, 79, 4],
        [4, 0, 81, 4], [4, 6, 76, 2], [4, 8, 72, 6],
        [5, 0, 77, 4], [5, 6, 81, 2], [5, 8, 77, 6],
        [6, 0, 74, 4], [6, 6, 77, 2], [6, 8, 81, 6],
        [7, 0, 79, 4], [7, 6, 76, 2], [7, 8, 71, 4], [7, 12, 76, 4],
      ],
    },
    drums: { kick: [0, 4, 8, 12], snare: [4, 12], hat: EVENS, accent: [2, 6, 10, 14] },
    echo: 0.2,
  },
  {
    id: 'glass',
    name: 'Glass',
    mood: 'Calm bells, no drums',
    step: 9000, // about 74 bpm
    // Dmaj9, Bm7, Gmaj9, A6, Dmaj9, F#m7, Gmaj9, Asus4
    bars: [
      { bass: 38, chord: [57, 61, 64, 66] },
      { bass: 47, chord: [57, 62, 66, 69] },
      { bass: 43, chord: [59, 62, 66, 69] },
      { bass: 45, chord: [57, 61, 64, 66] },
      { bass: 38, chord: [57, 61, 64, 66] },
      { bass: 42, chord: [57, 61, 64, 69] },
      { bass: 43, chord: [59, 62, 66, 69] },
      { bass: 45, chord: [57, 62, 64, 69] },
    ],
    arp: { steps: [0, -1, 1, -1, 2, -1, 3, -1, 2, -1, 1, -1, 2, -1, 3, -1], voice: 'bell', level: 0.1, octave: 12 },
    bass: { notes: [[0, 14, 0]], voice: 'round', level: 0.22 },
    pad: 0.06,
    echo: 0.4,
  },
];

export const songById = (id: string) => SONGS.find((s) => s.id === id);

// ---------- rendering ----------

const SAMPLE_RATE = 44_100;
const BAR_STEPS = 16;
/** Seconds rendered after each bar, to catch notes and echoes that ring past the bar line. */
const TAIL_SECONDS = 3;
/** The average level every song is brought to (about -22 dB). */
const TARGET_RMS = 0.08;

type OfflineCtor = typeof OfflineAudioContext;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

const cache = new Map<string, Promise<AudioBuffer>>();

/** A song as one seamless loop of audio (rendered once, then reused). */
export function renderSong(song: Song): Promise<AudioBuffer> {
  let job = cache.get(song.id);
  if (!job) {
    job = render(song);
    cache.set(song.id, job);
    job.catch(() => cache.delete(song.id));
  }
  return job;
}

async function render(song: Song): Promise<AudioBuffer> {
  const Ctor = window.OfflineAudioContext ?? (window as Window & { webkitOfflineAudioContext?: OfflineCtor }).webkitOfflineAudioContext;
  if (!Ctor) throw new Error('Offline audio is not supported');

  // One shared second of noise for the drums.
  const noise = new Float32Array(SAMPLE_RATE);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;

  // Each bar is rendered by itself (small, fast jobs that run side by side), then the bars are
  // laid end to end. Whatever rings past a bar line is added onto the next bar, and the tail
  // of the last bar wraps onto the first: that wrap is what makes the loop seamless.
  const bars = await Promise.all(song.bars.map((_, b) => renderBar(Ctor, song, b, noise)));

  const barSamples = BAR_STEPS * song.step;
  const loopSamples = song.bars.length * barSamples;
  const mix = [new Float32Array(loopSamples), new Float32Array(loopSamples)];
  bars.forEach((bar, b) => {
    for (let ch = 0; ch < 2; ch++) {
      const data = bar.getChannelData(ch);
      const out = mix[ch];
      let at = (b * barSamples) % loopSamples;
      for (let i = 0; i < data.length; i++) {
        out[at] += data[i];
        if (++at === loopSamples) at = 0;
      }
    }
  });

  // Bring every song to the same average loudness, without letting any sample clip.
  let peak = 0;
  let squares = 0;
  for (const out of mix) {
    for (let i = 0; i < out.length; i++) {
      peak = Math.max(peak, Math.abs(out[i]));
      squares += out[i] * out[i];
    }
  }
  const rms = Math.sqrt(squares / (2 * loopSamples));
  const scale = peak > 0 ? Math.min(0.9 / peak, TARGET_RMS / rms) : 1;

  const loop = new Ctor(2, 1, SAMPLE_RATE).createBuffer(2, loopSamples, SAMPLE_RATE);
  mix.forEach((out, ch) => {
    const data = loop.getChannelData(ch);
    for (let i = 0; i < out.length; i++) data[i] = out[i] * scale;
  });
  return loop;
}

/** One bar of the arrangement, plus its tail. */
function renderBar(Ctor: OfflineCtor, song: Song, b: number, noise: Float32Array): Promise<AudioBuffer> {
  const bar = song.bars[b];
  const STEP = song.step / SAMPLE_RATE;
  const tail = Math.ceil(TAIL_SECONDS / STEP) * song.step;
  const c = new Ctor(2, BAR_STEPS * song.step + tail, SAMPLE_RATE);
  /** When a step sounds, with the off-beats pushed late by the swing. */
  const at = (step: number) => (step + (step % 2 ? (song.swing ?? 0) : 0)) * STEP;

  const master = c.createGain();
  master.gain.value = 0.7;
  master.connect(c.destination);

  // A dotted-eighth echo on the tuned parts, for a little room.
  const echo = c.createDelay(1);
  echo.delayTime.value = Math.min(0.95, STEP * 3);
  const feedback = c.createGain();
  feedback.gain.value = 0.32;
  const damp = c.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 2600;
  echo.connect(damp).connect(feedback).connect(echo);
  damp.connect(master);
  const send = c.createGain();
  send.gain.value = song.echo;
  send.connect(echo);

  const noiseBuf = c.createBuffer(1, noise.length, SAMPLE_RATE);
  noiseBuf.getChannelData(0).set(noise);

  /** One enveloped oscillator. */
  const osc = (dest: AudioNode, type: OscillatorType, freq: number, t: number, dur: number, peak: number, attack = 0.003, glideTo?: number) => {
    const o = c.createOscillator();
    const env = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(env).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  /** A place in the stereo field that feeds the mix and, when `wet`, the echo. */
  const place = (pan: number, wet: boolean) => {
    const g = c.createGain();
    if (typeof c.createStereoPanner === 'function') {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(master);
      if (wet) p.connect(send);
    } else {
      g.connect(master);
      if (wet) g.connect(send);
    }
    return g;
  };
  const left = place(-0.3, true);
  const right = place(0.3, true);
  const centre = place(0, true);
  const dry = place(0, false);

  const lowpass = (freq: number, dest: AudioNode) => {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    f.connect(dest);
    return f;
  };
  const bassTone = lowpass(520, dry);
  const padTone = lowpass(1100, dry);
  const pluckLeft = lowpass(1900, left);
  const pluckRight = lowpass(1900, right);
  const squareTone = lowpass(2200, centre);

  /** A burst of filtered noise. `slice` picks which part of the noise, so each drum hit differs a little. */
  const hit = (t: number, dur: number, peak: number, type: BiquadFilterType, freq: number, slice: number) => {
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const env = c.createGain();
    env.gain.setValueAtTime(peak, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(env).connect(dry);
    src.start(t, (slice * 0.037) % 0.9);
    src.stop(t + dur + 0.02);
  };

  /** One note of a chord instrument. `side` alternates left and right. */
  const chordNote = (voice: ChordVoice, midi: number, t: number, peak: number, side: number) => {
    const f = hz(midi);
    const dest = side % 2 ? right : left;
    if (voice === 'marimba') {
      osc(dest, 'sine', f, t, 0.3, peak);
      osc(dest, 'sine', f * 4, t, 0.06, peak * 0.22, 0.002);
    } else if (voice === 'pluck') {
      osc(side % 2 ? pluckRight : pluckLeft, 'sawtooth', f, t, 0.16, peak, 0.002);
    } else if (voice === 'keys') {
      osc(dest, 'sine', f, t, 1.1, peak, 0.006);
      osc(dest, 'sine', f * 2, t, 0.5, peak * 0.15, 0.006);
      osc(dest, 'triangle', f * 1.002, t, 0.9, peak * 0.2, 0.008);
    } else {
      osc(dest, 'sine', f, t, 1.4, peak, 0.004);
      osc(dest, 'sine', f * 2.76, t, 0.6, peak * 0.12, 0.004);
      osc(dest, 'sine', f * 5.4, t, 0.25, peak * 0.05, 0.004);
    }
  };

  if (song.arp) {
    const { steps, voice, level, octave = 0 } = song.arp;
    steps.forEach((idx, step) => {
      if (idx >= 0) chordNote(voice, bar.chord[idx] + octave, at(step), step % 8 === 0 ? level * 1.2 : level * 0.85, step >> 1);
    });
  }

  if (song.stabs) {
    const { steps, voice, level } = song.stabs;
    for (const step of steps) bar.chord.forEach((midi, i) => chordNote(voice, midi, at(step), step === 0 ? level : level * 0.7, i));
  }

  for (const [step, steps, up] of song.bass.notes) {
    const f = hz(bar.bass + up);
    const dur = steps * STEP * 0.92;
    if (song.bass.voice === 'round') {
      osc(bassTone, 'triangle', f, at(step), dur, song.bass.level, 0.008);
      osc(bassTone, 'sine', f * 2, at(step), dur * 0.7, song.bass.level * 0.3, 0.008);
    } else {
      osc(bassTone, 'sawtooth', f, at(step), dur, song.bass.level * 0.7, 0.004);
      osc(bassTone, 'sine', f, at(step), dur, song.bass.level * 0.6, 0.004);
    }
  }

  // Pad: the chord an octave down, held softly under everything.
  if (song.pad) {
    const barEnd = BAR_STEPS * STEP;
    for (const midi of bar.chord.slice(1)) {
      const o = c.createOscillator();
      const env = c.createGain();
      o.type = 'triangle';
      o.frequency.value = hz(midi - 12);
      env.gain.setValueAtTime(0.0001, 0);
      env.gain.linearRampToValueAtTime(song.pad, 0.25);
      env.gain.setValueAtTime(song.pad, barEnd - 0.1);
      env.gain.linearRampToValueAtTime(0.0001, barEnd + 0.3);
      o.connect(env).connect(padTone);
      o.start(0);
      o.stop(barEnd + 0.35);
    }
  }

  if (song.drums) {
    const d = song.drums;
    for (const step of b % 2 && d.kickAlt ? d.kickAlt : d.kick) {
      osc(dry, 'sine', 150, at(step), 0.2, step % 4 ? 0.28 : 0.42, 0.002, 48);
    }
    for (const step of d.snare) {
      hit(at(step), 0.07, 0.16, 'bandpass', 1900, b * BAR_STEPS + step + 0.5);
      osc(dry, 'sine', 400, at(step), 0.03, 0.05, 0.002, 280);
    }
    for (const step of d.hat) {
      hit(at(step), 0.03, d.accent?.includes(step) ? 0.075 : step % 2 ? 0.025 : 0.04, 'highpass', 7500, b * BAR_STEPS + step);
    }
  }

  if (song.lead) {
    const { voice, level } = song.lead;
    for (const [lb, step, midi, steps] of song.lead.notes) {
      if (lb !== b) continue;
      const f = hz(midi);
      const t = at(step);
      const dur = Math.max(0.35, steps * STEP * 1.15);
      if (voice === 'glass') {
        osc(centre, 'sine', f, t, dur, level, 0.005);
        osc(centre, 'sine', f * 2, t, dur * 0.55, level * 0.24, 0.005);
        osc(centre, 'triangle', f * 1.003, t, dur * 0.8, level * 0.18, 0.008);
      } else if (voice === 'soft') {
        osc(centre, 'sine', f, t, dur * 1.2, level, 0.03);
        osc(centre, 'triangle', f * 1.004, t, dur, level * 0.25, 0.04);
      } else {
        osc(squareTone, 'square', f, t, dur * 0.9, level, 0.004);
        osc(centre, 'sine', f, t, dur, level * 0.8, 0.004);
      }
    }
  }

  return c.startRendering();
}
