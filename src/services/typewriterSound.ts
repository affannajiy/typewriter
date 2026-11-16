/**
 * Typewriter sounds, synthesised with the Web Audio API.
 *
 * Nothing is recorded or downloaded: each sound is built from filtered noise
 * and short tones. That keeps the app offline, adds no audio files to the
 * build, and leaves no licence to verify.
 *
 * The model is a manual desk typewriter. Each sound is made of the events
 * that happen inside the machine, in order:
 *
 * - key: the key lever goes down, the type slug hits paper on the rubber
 *   platen, the typebar rings and falls back, the escapement lets the
 *   carriage move one step.
 * - space: the wide space bar bottoms out, and the escapement steps. No slug.
 * - backspace: the carriage is pulled back one tooth of the rack.
 * - shiftDown / shiftUp: the type basket lifts, then drops back.
 * - bell: the margin bell, a small steel gong struck once.
 * - return: the lever clicks the platen round by one line, the carriage
 *   slides back along its rail, and it hits the margin stop.
 * - paper: the platen knob is turned to feed a sheet, then the paper bail
 *   snaps down.
 *
 * Three machines share these events and differ in build: how big and heavy
 * the parts are, how long they ring, how far the carriage runs.
 */

import type { SoundMachine } from '@/features/settings/model';

export type SoundKind = 'key' | 'space' | 'backspace' | 'shiftDown' | 'shiftUp' | 'bell' | 'return' | 'paper';

export interface SoundDetail {
  /** The character typed. Gives each key its own place and voice. */
  char?: string;
  /** For `return`: ring the bell as the lever is pulled. */
  bell?: boolean;
  /** For `return`: how far the carriage has to travel back, 0 to 1. */
  travel?: number;
}

/**
 * Maps one edit, as the browser reports it (`InputEvent.inputType` and
 * `.data`), to a sound. Works the same for hardware and on-screen keyboards.
 * Paste, drop, undo and redo are silent: no key struck the page.
 */
export function soundForInput(inputType: string, data: string | null): 'key' | 'space' | 'backspace' | 'return' | null {
  switch (inputType) {
    case 'insertText':
    case 'insertCompositionText':
      if (data === '\n') return 'return';
      return data !== null && data.trim() === '' && data !== '' ? 'space' : 'key';
    case 'insertLineBreak':
    case 'insertParagraph':
      return 'return';
    default:
      return inputType.startsWith('delete') && !inputType.endsWith('Cut') && !inputType.endsWith('Drag') ? 'backspace' : null;
  }
}

/** What makes one machine sound unlike another. */
export interface MachineVoice {
  /** Multiplies every pitch: smaller parts sound higher. */
  pitch: number;
  /** Multiplies the low thumps: the mass of the frame and the carriage. */
  weight: number;
  /** Multiplies how long every part rings. */
  decay: number;
  /** Share of the sound that rings through the machine's body. */
  body: number;
  /** Multiplies how long the carriage takes to run back. */
  carriage: number;
  /** Pitch of the margin bell, in hertz. */
  bell: number;
}

export const MACHINES: Record<SoundMachine, MachineVoice> = {
  /** A manual desk typewriter: the original model. */
  desk: { pitch: 1, weight: 1, decay: 1, body: 0.22, carriage: 1, bell: 2250 },
  /** A portable in a case: light parts, a thin shell, a short carriage, a small bright bell. */
  portable: { pitch: 1.28, weight: 0.5, decay: 0.7, body: 0.1, carriage: 0.75, bell: 2900 },
  /** A heavy standard office machine: a cast frame, a long carriage, a deep bell. */
  office: { pitch: 0.8, weight: 1.4, decay: 1.3, body: 0.34, carriage: 1.25, bell: 1800 },
};

interface Engine {
  context: BaseAudioContext;
  machine: MachineVoice;
  /** The body resonance's level, set from the machine. Null where the browser has no convolver. */
  body: GainNode | null;
  /** Sets the volume. Everything passes through it. */
  master: GainNode;
  /** Where voices connect. Feeds the master directly and through the body resonance. */
  bus: GainNode;
  noise: AudioBuffer;
}

/** Loudest master gain. Below 1 so that overlapping sounds do not clip. */
const HEADROOM = 0.7;
/** Shortest gap between two strikes, so a held key does not become a buzz. */
const MIN_GAP_MS = 18;
function buildEngine(context: BaseAudioContext, machine: MachineVoice = MACHINES.desk): Engine {
  // The master gain is the first node made: the volume control.
  const master = context.createGain();
  let exit: AudioNode = context.destination;
  // A fast limiter: a carriage stop on top of a bell must not distort.
  if (typeof context.createDynamicsCompressor === 'function') {
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    limiter.connect(exit);
    exit = limiter;
  }
  master.connect(exit);

  const bus = context.createGain();
  // Filtered noise is quiet for its peak level; this brings a key strike up to a clear knock.
  bus.gain.value = 1.5;
  bus.connect(master);

  const rate = context.sampleRate;
  let body: GainNode | null = null;
  // The body of the machine and the desk under it: a very short, dense echo.
  if (typeof context.createConvolver === 'function') {
    const length = Math.floor(rate * 0.22);
    const impulse = context.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const samples = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / (rate * 0.035));
    }
    const resonance = context.createConvolver();
    resonance.buffer = impulse;
    body = context.createGain();
    body.gain.value = machine.body;
    bus.connect(resonance);
    resonance.connect(body);
    body.connect(master);
  }

  // One second of white noise; every strike reads a random slice of it.
  const noise = context.createBuffer(1, rate, rate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return { context, machine, body, master, bus, noise };
}

/** Switches the machine the next sounds are made on. */
function setMachine(e: Engine, machine: MachineVoice) {
  e.machine = machine;
  if (e.body) e.body.gain.value = machine.body;
}

/** A value near `centre`, so that no two strikes sound identical. */
const vary = (centre: number, spread = 0.08) => centre * (1 + (Math.random() * 2 - 1) * spread);

/** A stable number from 0 to 1 for a character: each key keeps its own voice. */
function voiceOf(char: string | undefined): number {
  if (!char) return 0.5;
  return ((((char.toLowerCase().codePointAt(0) ?? 0) * 2654435761) >>> 0) % 1000) / 1000;
}

const KEY_ROWS = ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'];

/** Where a key sits on the keyboard, from -1 (far left) to 1 (far right). */
function placeOf(char: string | undefined): number {
  if (!char) return 0;
  const key = char.toLowerCase();
  for (const row of KEY_ROWS) {
    const index = row.indexOf(key);
    if (index >= 0) return (index / (row.length - 1)) * 2 - 1;
  }
  return 0;
}

/** A point between the listener's ears. Falls back to the centre on old browsers. */
function at(e: Engine, pan: number): { node: AudioNode; pan: AudioParam | null } {
  if (typeof e.context.createStereoPanner !== 'function') return { node: e.bus, pan: null };
  const panner = e.context.createStereoPanner();
  panner.pan.value = pan;
  panner.connect(e.bus);
  return { node: panner, pan: panner.pan };
}

interface Burst {
  frequency: number;
  gain: number;
  /** Seconds until the sound has faded out. */
  decay: number;
  q?: number;
  type?: BiquadFilterType;
}

/** A burst of filtered noise: metal on metal, metal on paper. */
function click(e: Engine, out: AudioNode, when: number, { frequency, gain, decay: base, q = 1.2, type = 'bandpass' }: Burst) {
  const decay = base * e.machine.decay;
  const source = e.context.createBufferSource();
  source.buffer = e.noise;
  const filter = e.context.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = vary(frequency * e.machine.pitch);
  filter.Q.value = q;
  const envelope = e.context.createGain();
  envelope.gain.setValueAtTime(gain, when);
  envelope.gain.exponentialRampToValueAtTime(0.001, when + decay);
  source.connect(filter).connect(envelope).connect(out);
  source.start(when, Math.random() * 0.8, decay + 0.02);
}

/** A falling low tone: weight landing on the frame. */
function thump(e: Engine, out: AudioNode, when: number, from: number, to: number, gain: number, base: number) {
  const { pitch, weight } = e.machine;
  const decay = base * e.machine.decay;
  const oscillator = e.context.createOscillator();
  oscillator.frequency.setValueAtTime(vary(from * pitch), when);
  oscillator.frequency.exponentialRampToValueAtTime(to * pitch, when + decay);
  const envelope = e.context.createGain();
  envelope.gain.setValueAtTime(gain * weight, when);
  envelope.gain.exponentialRampToValueAtTime(0.001, when + decay);
  oscillator.connect(envelope).connect(out);
  oscillator.start(when);
  oscillator.stop(when + decay + 0.02);
}

/** A steady tone that dies away: a part left ringing. */
function ring(e: Engine, out: AudioNode, when: number, frequency: number, gain: number, base: number) {
  const decay = base * e.machine.decay;
  const oscillator = e.context.createOscillator();
  oscillator.frequency.value = frequency * e.machine.pitch;
  const envelope = e.context.createGain();
  // A two-millisecond rise: struck, not switched on.
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(gain, when + 0.002);
  envelope.gain.exponentialRampToValueAtTime(0.0001, when + decay);
  oscillator.connect(envelope).connect(out);
  oscillator.start(when);
  oscillator.stop(when + decay + 0.02);
}

/** Noise that lasts: a part sliding along a rail. The pitch rises as it speeds up. */
function slide(e: Engine, out: AudioNode, when: number, duration: number, gain: number, from: number, to: number) {
  const source = e.context.createBufferSource();
  source.buffer = e.noise;
  source.loop = true;
  const filter = e.context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 0.9;
  filter.frequency.setValueAtTime(from * e.machine.pitch, when);
  filter.frequency.exponentialRampToValueAtTime(to * e.machine.pitch, when + duration);
  const envelope = e.context.createGain();
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(gain, when + duration * 0.3);
  envelope.gain.exponentialRampToValueAtTime(gain * 0.7, when + duration * 0.9);
  envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  source.connect(filter).connect(envelope).connect(out);
  source.start(when);
  source.stop(when + duration + 0.02);
}

/**
 * The margin bell: a small steel gong, struck once by a sprung clapper.
 * A gong's overtones are not whole multiples of its pitch; two close
 * fundamentals give the slow shimmer of a real one.
 */
function bell(e: Engine, when: number) {
  // The bell sits at the back left of the machine.
  const out = at(e, -0.35).node;
  // The bell has its own pitch on each machine; ring() scales by the machine's pitch, so undo that here.
  const pitch = vary(e.machine.bell, 0.01) / e.machine.pitch;
  click(e, out, when, { frequency: 4200, gain: 0.3, decay: 0.012, q: 0.8 });
  ring(e, out, when, pitch, 0.3, 1.7);
  ring(e, out, when, pitch * 1.004, 0.14, 1.7);
  ring(e, out, when, pitch * 2.76, 0.11, 0.8);
  ring(e, out, when, pitch * 5.4, 0.04, 0.3);
}

function carriageReturn(e: Engine, when: number, detail: SoundDetail) {
  const travel = Math.min(Math.max(detail.travel ?? 0.6, 0), 1);
  let t = when;
  if (detail.bell) {
    bell(e, t);
    // Let the bell speak before the mechanism covers its attack.
    t += 0.11;
  }
  // The carriage ends at the right: the sound moves with it.
  const { node: out, pan } = at(e, -0.3);

  // The lever takes up its slack, then turns the platen: two detent clicks.
  click(e, out, t, { frequency: 1200, gain: 0.28, decay: 0.03 });
  for (let i = 0; i < 2; i++) {
    const tick = t + 0.03 + i * 0.034;
    click(e, out, tick, { frequency: 2500, gain: 0.3, decay: 0.016, q: 3 });
    thump(e, out, tick, 210, 120, 0.12, 0.03);
  }

  // The carriage runs back along its rail, the escapement rack buzzing past its pawl.
  const start = t + 0.1;
  const duration = (0.1 + 0.3 * travel) * e.machine.carriage;
  slide(e, out, start, duration, 0.2, 700, 2100);
  const teeth = Math.round((5 + 22 * travel) * e.machine.carriage);
  for (let i = 0; i < teeth; i++) {
    // Teeth pass faster as the carriage gathers speed.
    const progress = Math.pow((i + 1) / (teeth + 1), 0.75);
    click(e, out, start + progress * duration, { frequency: 3400, gain: 0.09, decay: 0.008, q: 4 });
  }
  pan?.setValueAtTime(-0.3, start);
  pan?.linearRampToValueAtTime(0.35, start + duration);

  // The margin stop: the heaviest sound the machine makes.
  const stop = start + duration;
  click(e, out, stop, { frequency: 480, gain: 0.45, decay: 0.09, q: 0.8 });
  click(e, out, stop, { frequency: 2600, gain: 0.2, decay: 0.02 });
  thump(e, out, stop, 88, 38, 0.5, 0.15);
  ring(e, out, stop, vary(1320, 0.03), 0.04, 0.18);
  // The lever springs back.
  click(e, out, stop + 0.07, { frequency: 1500, gain: 0.12, decay: 0.02 });
}

const voices: Record<SoundKind, (e: Engine, when: number, detail: SoundDetail) => void> = {
  key(e, when, { char }) {
    const out = at(e, placeOf(char) * 0.3).node;
    const voice = 0.93 + voiceOf(char) * 0.14;
    // Small slugs (full stop, comma) punch the paper harder; capitals sit higher on the bar.
    const sharp = char !== undefined && /[.,;:'"!?-]/.test(char) ? 1.2 : 1;
    const force = vary(1, 0.14);
    // Key lever and linkage.
    click(e, out, when, { frequency: 420, gain: 0.12 * force, decay: 0.02 });
    // The slug meets ribbon, paper and platen.
    const hit = when + 0.01;
    click(e, out, hit, { frequency: 3300 * voice * sharp, gain: 0.5 * force, decay: 0.028, type: 'highpass', q: 0.7 });
    click(e, out, hit, { frequency: 1150 * voice, gain: 0.42 * force, decay: 0.045 });
    thump(e, out, hit, 175 * voice, 75, 0.38 * force, 0.06);
    // The typebar rings for an instant.
    ring(e, out, hit, 3600 * voice, 0.03 * force, 0.07);
    // The typebar drops back into the basket; the escapement steps the carriage.
    click(e, out, when + 0.055, { frequency: 1700, gain: 0.11, decay: 0.018 });
    click(e, out, when + 0.07, { frequency: 4800, gain: 0.05, decay: 0.008, q: 3 });
  },
  space(e, when) {
    const out = e.bus;
    const force = vary(1, 0.12);
    // A long wooden or metal bar: a hollow knock, no slug.
    click(e, out, when, { frequency: 520, gain: 0.42 * force, decay: 0.07, q: 0.8 });
    thump(e, out, when, 118, 52, 0.5 * force, 0.09);
    // Escapement.
    click(e, out, when + 0.028, { frequency: 2300, gain: 0.17, decay: 0.014, q: 2.5 });
    // The bar comes back up against its stop.
    click(e, out, when + 0.085, { frequency: 900, gain: 0.1, decay: 0.03 });
  },
  backspace(e, when) {
    const out = at(e, 0.4).node;
    click(e, out, when, { frequency: 450, gain: 0.14, decay: 0.02 });
    // The pawl rides over one tooth and drops in behind it.
    click(e, out, when + 0.012, { frequency: 2100, gain: 0.34, decay: 0.014, q: 3 });
    click(e, out, when + 0.04, { frequency: 2700, gain: 0.26, decay: 0.012, q: 3 });
    thump(e, out, when + 0.012, 135, 60, 0.34, 0.06);
  },
  shiftDown(e, when) {
    const out = e.bus;
    // The whole type basket is lifted: weight, then a metal stop.
    thump(e, out, when, 96, 46, 0.5, 0.12);
    click(e, out, when, { frequency: 360, gain: 0.3, decay: 0.08, q: 0.8 });
    click(e, out, when + 0.022, { frequency: 1600, gain: 0.14, decay: 0.02, q: 2 });
  },
  shiftUp(e, when) {
    const out = e.bus;
    // The basket falls back onto its rest under its own weight.
    click(e, out, when, { frequency: 900, gain: 0.3, decay: 0.035 });
    thump(e, out, when, 112, 50, 0.46, 0.1);
    ring(e, out, when, vary(1250, 0.04), 0.025, 0.12);
  },
  bell: (e, when) => bell(e, when),
  return: carriageReturn,
  paper(e, when) {
    const out = at(e, 0.3).node;
    // The platen knob turns: a run of detent clicks, never quite even.
    let t = when;
    for (let i = 0; i < 9; i++) {
      click(e, out, t, { frequency: 2200, gain: 0.13, decay: 0.014, q: 3 });
      thump(e, out, t, 200, 130, 0.07, 0.025);
      t += vary(0.048, 0.2);
    }
    // Paper against rubber.
    slide(e, e.bus, when, t - when, 0.035, 3500, 5200);
    // The paper bail snaps down.
    click(e, e.bus, t + 0.09, { frequency: 1400, gain: 0.22, decay: 0.03 });
    thump(e, e.bus, t + 0.09, 150, 70, 0.3, 0.07);
  },
};

let engine: Engine | null = null;
let lastStrikeAt = -Infinity;

function getEngine(): Engine | null {
  if (engine) return engine;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  engine = buildEngine(new Ctor());
  return engine;
}

/** Strikes that a held key repeats. Everything else always plays. */
const REPEATING: ReadonlySet<SoundKind> = new Set(['key', 'space', 'backspace']);

/**
 * Plays one sound. `volume` is 0 to 100. Does nothing, and never throws, when
 * the browser has no Web Audio or refuses to start it: sound is decoration and
 * must not interrupt writing.
 */
export function playTypewriterSound(kind: SoundKind, volume: number, detail: SoundDetail = {}, machine: SoundMachine = 'desk'): void {
  if (volume <= 0) return;
  try {
    const e = getEngine();
    if (!e) return;
    const context = e.context as AudioContext;
    if (REPEATING.has(kind)) {
      const nowMs = performance.now();
      if (nowMs - lastStrikeAt < MIN_GAP_MS) return;
      lastStrikeAt = nowMs;
    }
    // Browsers start audio suspended until the user acts; typing is such an act.
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    e.master.gain.value = (Math.min(volume, 100) / 100) * HEADROOM;
    setMachine(e, MACHINES[machine] ?? MACHINES.desk);
    voices[kind](e, context.currentTime + 0.001, detail);
  } catch {
    // Decoration only.
  }
}

/**
 * True once the browser has let audio start. A sound asked for before that
 * would wait and then play late, at the first key press.
 */
export function isTypewriterSoundReady(): boolean {
  return engine !== null && (engine.context as AudioContext).state === 'running';
}

/**
 * Renders one sound to a buffer without playing it, at full volume.
 * For tuning and for tests that measure the result.
 */
export async function renderTypewriterSound(kind: SoundKind, detail: SoundDetail = {}, seconds = 2.5, machine: SoundMachine = 'desk'): Promise<AudioBuffer> {
  const rate = 44100;
  const context = new OfflineAudioContext(2, Math.floor(rate * seconds), rate);
  const e = buildEngine(context, MACHINES[machine]);
  e.master.gain.value = HEADROOM;
  voices[kind](e, 0.01, detail);
  return context.startRendering();
}

/** For tests: forget the audio context so the next sound builds a new one. */
export function resetTypewriterSound(): void {
  void (engine?.context as AudioContext | undefined)?.close().catch(() => undefined);
  engine = null;
  lastStrikeAt = -Infinity;
}
