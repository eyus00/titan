/**
 * Titan's theme: a short original loop (marimba chords, a bell melody, light drums), written
 * as notes below and rendered to audio in the browser the first time a game opens. Nothing to
 * download, and the loop point is exact, so it repeats without a gap.
 *
 * To change the tune, edit BARS (harmony) and MELODY. Steps are sixteenth notes, 16 to a bar.
 */

const SAMPLE_RATE = 44_100;
/** One sixteenth note in samples (a whole number, so the loop length is exact): about 110 bpm. */
const STEP_SAMPLES = 6_000;
const STEP = STEP_SAMPLES / SAMPLE_RATE;
const BAR_STEPS = 16;

interface Bar {
  bass: number;
  pad: number[];
  arp: number[];
}

// MIDI note numbers. Cmaj7, Am7, Fmaj7, G6, Cmaj7, Em7, Fmaj7, G
const BARS: Bar[] = [
  { bass: 36, pad: [52, 55, 59], arp: [60, 64, 67, 71] },
  { bass: 45, pad: [52, 55, 60], arp: [57, 60, 64, 67] },
  { bass: 41, pad: [52, 57, 60], arp: [57, 60, 64, 69] },
  { bass: 43, pad: [50, 55, 59], arp: [55, 59, 62, 64] },
  { bass: 36, pad: [52, 55, 59], arp: [60, 64, 67, 71] },
  { bass: 40, pad: [50, 55, 59], arp: [55, 59, 62, 64] },
  { bass: 41, pad: [52, 57, 60], arp: [57, 60, 64, 69] },
  { bass: 43, pad: [50, 55, 59], arp: [55, 59, 62, 67] },
];

/** Which chord note the marimba plays on each eighth note. */
const ARP_SHAPE = [0, 2, 1, 2, 3, 2, 1, 2];

/** [bar, step in bar, MIDI note, length in steps] */
const MELODY: [number, number, number, number][] = [
  [0, 0, 67, 3], [0, 3, 72, 3], [0, 6, 76, 6],
  [1, 0, 74, 3], [1, 3, 72, 3], [1, 6, 69, 6],
  [2, 0, 69, 3], [2, 3, 72, 3], [2, 6, 76, 4], [2, 10, 74, 2], [2, 12, 72, 4],
  [3, 0, 74, 6], [3, 8, 71, 4], [3, 12, 67, 4],
  [4, 0, 67, 3], [4, 3, 72, 3], [4, 6, 76, 4], [4, 10, 79, 6],
  [5, 0, 76, 3], [5, 3, 74, 3], [5, 6, 71, 6], [5, 12, 74, 4],
  [6, 0, 72, 3], [6, 3, 69, 3], [6, 6, 72, 4], [6, 10, 76, 2], [6, 12, 77, 4],
  [7, 0, 74, 6], [7, 8, 76, 2], [7, 10, 74, 2], [7, 12, 71, 4],
];

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Extra steps rendered after each bar, to catch notes and echoes that ring past the bar line. */
const TAIL_STEPS = 20;

type OfflineCtor = typeof OfflineAudioContext;

let cached: Promise<AudioBuffer> | null = null;

/** The theme as one seamless loop of audio (rendered once, then reused). */
export function renderTheme(): Promise<AudioBuffer> {
  cached ??= render().catch((err) => {
    cached = null;
    throw err;
  });
  return cached;
}

async function render(): Promise<AudioBuffer> {
  const Ctor = window.OfflineAudioContext ?? (window as Window & { webkitOfflineAudioContext?: OfflineCtor }).webkitOfflineAudioContext;
  if (!Ctor) throw new Error('Offline audio is not supported');

  // One shared second of noise for the drums (the same in every bar, so the render is repeatable).
  const noise = new Float32Array(SAMPLE_RATE);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;

  // Each bar is rendered by itself (small, fast jobs that run side by side), then the bars are
  // laid end to end. Whatever rings past a bar line is added onto the next bar, and the tail
  // of the last bar wraps onto the first: that wrap is what makes the loop seamless.
  const bars = await Promise.all(BARS.map((_, b) => renderBar(Ctor, b, noise)));

  const barSamples = BAR_STEPS * STEP_SAMPLES;
  const loopSamples = BARS.length * barSamples;
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

  // Bring the loudest sample to a fixed level: never clips, and plays at a known loudness.
  let peak = 0;
  for (const out of mix) for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const scale = peak > 0 ? 0.8 / peak : 1;

  const loop = new Ctor(2, 1, SAMPLE_RATE).createBuffer(2, loopSamples, SAMPLE_RATE);
  mix.forEach((out, ch) => {
    const data = loop.getChannelData(ch);
    for (let i = 0; i < out.length; i++) data[i] = out[i] * scale;
  });
  return loop;
}

/** One bar of the arrangement, plus its tail. */
function renderBar(Ctor: OfflineCtor, b: number, noise: Float32Array): Promise<AudioBuffer> {
  const bar = BARS[b];
  const c = new Ctor(2, (BAR_STEPS + TAIL_STEPS) * STEP_SAMPLES, SAMPLE_RATE);
  const at = (step: number) => step * STEP;

  const master = c.createGain();
  master.gain.value = 0.7;
  master.connect(c.destination);

  // A dotted-eighth echo on the tuned parts, for a little room.
  const echo = c.createDelay(1);
  echo.delayTime.value = STEP * 3;
  const feedback = c.createGain();
  feedback.gain.value = 0.32;
  const damp = c.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 2600;
  echo.connect(damp).connect(feedback).connect(echo);
  damp.connect(master);
  const send = c.createGain();
  send.gain.value = 0.22;
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

  const bassTone = c.createBiquadFilter();
  bassTone.type = 'lowpass';
  bassTone.frequency.value = 520;
  bassTone.connect(dry);

  const padTone = c.createBiquadFilter();
  padTone.type = 'lowpass';
  padTone.frequency.value = 1100;
  padTone.connect(dry);

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

  // Marimba: broken chords in eighth notes, alternating sides.
  ARP_SHAPE.forEach((idx, i) => {
    const f = hz(bar.arp[idx]);
    const dest = i % 2 ? right : left;
    const peak = i % 4 === 0 ? 0.15 : 0.1;
    osc(dest, 'sine', f, at(i * 2), 0.3, peak);
    osc(dest, 'sine', f * 4, at(i * 2), 0.06, peak * 0.22, 0.002);
  });

  // Bass: root, root, fifth (a slow 3 + 3 + 2).
  const bass = (midi: number, step: number, steps: number) => {
    const dur = steps * STEP * 0.92;
    osc(bassTone, 'triangle', hz(midi), at(step), dur, 0.3, 0.008);
    osc(bassTone, 'sine', hz(midi + 12), at(step), dur * 0.7, 0.09, 0.008);
  };
  bass(bar.bass, 0, 6);
  bass(bar.bass, 6, 6);
  bass(bar.bass + 7, 12, 4);

  // Pad: the chord, held softly under everything.
  const barEnd = at(BAR_STEPS);
  for (const midi of bar.pad) {
    const o = c.createOscillator();
    const env = c.createGain();
    o.type = 'triangle';
    o.frequency.value = hz(midi);
    env.gain.setValueAtTime(0.0001, 0);
    env.gain.linearRampToValueAtTime(0.04, 0.25);
    env.gain.setValueAtTime(0.04, barEnd - 0.1);
    env.gain.linearRampToValueAtTime(0.0001, barEnd + 0.3);
    o.connect(env).connect(padTone);
    o.start(0);
    o.stop(barEnd + 0.35);
  }

  // Drums: kick on 1 and 3 (with a pickup every other bar), a snap on 2 and 4, hats on the eighths.
  for (const step of b % 2 ? [0, 8, 14] : [0, 8]) {
    osc(dry, 'sine', 150, at(step), 0.2, step === 14 ? 0.28 : 0.42, 0.002, 48);
  }
  for (const step of [4, 12]) {
    hit(at(step), 0.07, 0.16, 'bandpass', 1900, b * BAR_STEPS + step + 0.5);
    osc(dry, 'sine', 400, at(step), 0.03, 0.05, 0.002, 280);
  }
  for (let step = 0; step < BAR_STEPS; step += 2) {
    hit(at(step), 0.03, step % 4 === 2 ? 0.075 : 0.04, 'highpass', 7500, b * BAR_STEPS + step);
  }

  // Melody: a glassy bell.
  for (const [mb, step, midi, steps] of MELODY) {
    if (mb !== b) continue;
    const f = hz(midi);
    const dur = Math.max(0.35, steps * STEP * 1.15);
    osc(centre, 'sine', f, at(step), dur, 0.13, 0.005);
    osc(centre, 'sine', f * 2, at(step), dur * 0.55, 0.13 * 0.24, 0.005);
    osc(centre, 'triangle', f * 1.003, at(step), dur * 0.8, 0.13 * 0.18, 0.008);
  }

  return c.startRendering();
}
