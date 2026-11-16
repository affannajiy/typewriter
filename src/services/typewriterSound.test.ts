import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, resolveSettings } from '@/features/settings/model';
import { type CaretPlace, carriageEvents } from './carriage';
import { isTypewriterSoundReady, playTypewriterSound, resetTypewriterSound, soundForInput } from './typewriterSound';

describe('soundForInput', () => {
  it.each([
    ['insertText', 'a', 'key'],
    ['insertText', 'é', 'key'],
    ['insertText', ' ', 'space'],
    ['insertText', '\n', 'return'],
    ['insertCompositionText', 'か', 'key'],
    ['insertLineBreak', null, 'return'],
    ['insertParagraph', null, 'return'],
    ['deleteContentBackward', null, 'backspace'],
    ['deleteContentForward', null, 'backspace'],
    ['deleteWordBackward', null, 'backspace'],
  ] as const)('%s %j plays "%s"', (inputType, data, expected) => {
    expect(soundForInput(inputType, data)).toBe(expected);
  });

  it.each(['insertFromPaste', 'insertFromDrop', 'deleteByCut', 'deleteByDrag', 'historyUndo', 'historyRedo', 'formatBold', ''])('%j is silent', (inputType) => {
    expect(soundForInput(inputType, 'text')).toBeNull();
  });
});

/** Just enough of Web Audio to count what a sound builds. */
function installFakeAudio() {
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() });
  const node = () => ({ connect: vi.fn((next: unknown) => next), start: vi.fn(), stop: vi.fn() });
  const made = { contexts: 0, noise: 0, tones: 0, slides: 0, bells: 0, master: param(), resume: vi.fn(async () => undefined) };
  /** A tone that reports when it is set near the bell's pitch. */
  const tone = () => {
    made.tones++;
    const frequency = Object.defineProperty(param(), 'value', {
      set(hz: number) {
        if (hz > 2200 && hz < 2300) made.bells++;
      },
      get: () => 0,
    });
    return { ...node(), frequency };
  };
  /** A noise source that reports when it loops: only the sliding sounds do. */
  const source = () => {
    made.noise++;
    return Object.defineProperty({ ...node(), buffer: null as unknown }, 'loop', {
      set(loops: boolean) {
        if (loops) made.slides++;
      },
      get: () => false,
    });
  };
  class FakeAudioContext {
    state = 'suspended';
    sampleRate = 8000;
    currentTime = 0;
    destination = {};
    private gains = 0;
    constructor() {
      made.contexts++;
    }
    resume = made.resume;
    close = async () => undefined;
    createGain = () => ({ ...node(), gain: this.gains++ === 0 ? made.master : param() });
    createBuffer = (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) });
    createBufferSource = source;
    createConvolver: unknown = () => ({ ...node(), buffer: null });
    createStereoPanner: unknown = () => ({ ...node(), pan: param() });
    createDynamicsCompressor: unknown = () => ({ ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });
    createBiquadFilter = () => ({ ...node(), type: '', frequency: param(), Q: param() });
    createOscillator = tone;
  }
  vi.stubGlobal('AudioContext', FakeAudioContext);
  return Object.assign(made, { FakeAudioContext });
}

describe('playTypewriterSound', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    resetTypewriterSound();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does nothing and does not throw where Web Audio is missing', () => {
    expect(() => playTypewriterSound('key', 60)).not.toThrow();
  });

  it('builds a strike, resumes suspended audio and sets the volume', () => {
    const made = installFakeAudio();
    playTypewriterSound('key', 50);
    expect(made.contexts).toBe(1);
    expect(made.resume).toHaveBeenCalled();
    expect(made.noise).toBeGreaterThan(0);
    expect(made.master.value).toBeCloseTo(0.35);
  });

  it('reuses one audio context for every sound', () => {
    const made = installFakeAudio();
    playTypewriterSound('key', 60);
    vi.advanceTimersByTime(100);
    playTypewriterSound('space', 60);
    expect(made.contexts).toBe(1);
  });

  it('is silent at volume 0 without starting audio', () => {
    const made = installFakeAudio();
    playTypewriterSound('key', 0);
    expect(made.contexts).toBe(0);
  });

  it('drops a strike that follows another too closely, but never the carriage return', () => {
    const made = installFakeAudio();
    playTypewriterSound('key', 60);
    const afterFirst = made.noise;
    playTypewriterSound('key', 60);
    expect(made.noise).toBe(afterFirst);
    playTypewriterSound('return', 60);
    expect(made.noise).toBeGreaterThan(afterFirst);
    // Shift is pressed together with a key: it is never dropped either.
    const beforeShift = made.noise;
    playTypewriterSound('shiftDown', 60);
    expect(made.noise).toBeGreaterThan(beforeShift);
  });

  it.each(['key', 'space', 'backspace', 'shiftDown', 'shiftUp', 'bell', 'return', 'paper'] as const)('builds the "%s" sound', (kind) => {
    const made = installFakeAudio();
    playTypewriterSound(kind, 60, { char: 'Q' });
    expect(made.noise + made.tones).toBeGreaterThan(0);
  });

  it('rings the bell on its own, and with the carriage return only when asked', () => {
    const made = installFakeAudio();
    playTypewriterSound('return', 60, { travel: 1 });
    expect(made.bells).toBe(0);
    expect(made.slides).toBe(1);
    playTypewriterSound('return', 60, { travel: 1, bell: true });
    expect(made.bells).toBe(2); // two close tones: the shimmer of one bell
    playTypewriterSound('bell', 60);
    expect(made.bells).toBe(4);
    expect(made.slides).toBe(2);
  });

  it('passes more teeth of the rack when the carriage travels further', () => {
    const made = installFakeAudio();
    playTypewriterSound('return', 60, { travel: 0 });
    const short = made.noise;
    playTypewriterSound('return', 60, { travel: 1 });
    expect(made.noise - short).toBeGreaterThan(short);
  });

  it('still plays where the browser has no panner, reverb or limiter', () => {
    const made = installFakeAudio();
    vi.stubGlobal(
      'AudioContext',
      class extends made.FakeAudioContext {
        createConvolver = undefined;
        createStereoPanner = undefined;
        createDynamicsCompressor = undefined;
      },
    );
    playTypewriterSound('return', 60, { bell: true });
    expect(made.bells).toBe(2);
  });

  it('is not ready while the browser keeps audio suspended', () => {
    installFakeAudio();
    expect(isTypewriterSoundReady()).toBe(false);
    playTypewriterSound('key', 60);
    expect(isTypewriterSoundReady()).toBe(false);
  });

  it('makes each machine with its own build: the bell, the length of the carriage', () => {
    const made = installFakeAudio();
    const carriage = (machine: 'desk' | 'portable' | 'office') => {
      const before = made.noise;
      vi.advanceTimersByTime(100);
      playTypewriterSound('return', 60, { travel: 1 }, machine);
      return made.noise - before;
    };
    // The desk machine's bell is the one the fake listens for; the others are tuned elsewhere.
    playTypewriterSound('bell', 60, {}, 'portable');
    playTypewriterSound('bell', 60, {}, 'office');
    expect(made.bells).toBe(0);
    playTypewriterSound('bell', 60, {}, 'desk');
    expect(made.bells).toBe(2);
    // A longer carriage passes more teeth of the rack.
    expect(carriage('office')).toBeGreaterThan(carriage('desk'));
    expect(carriage('desk')).toBeGreaterThan(carriage('portable'));
  });

  it('plays the desk machine for an unknown machine name', () => {
    const made = installFakeAudio();
    playTypewriterSound('bell', 60, {}, 'harpsichord' as never);
    expect(made.bells).toBe(2);
  });

  it('never lets an audio failure reach the writer', () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('audio device busy');
        }
      },
    );
    expect(() => playTypewriterSound('key', 60)).not.toThrow();
  });
});

describe('sound settings', () => {
  it('are off by default and reject invalid stored values', () => {
    expect(DEFAULT_SETTINGS.typingSound).toBe(false);
    expect(resolveSettings({ typingSound: 'yes', soundVolume: 250 })).toMatchObject({ typingSound: false, soundVolume: 60 });
    expect(resolveSettings({ typingSound: true, soundVolume: 0 })).toMatchObject({ typingSound: true, soundVolume: 0 });
  });

  it('model the desk machine unless another is chosen', () => {
    expect(DEFAULT_SETTINGS.soundMachine).toBe('desk');
    expect(resolveSettings({ soundMachine: 'office' }).soundMachine).toBe('office');
    expect(resolveSettings({ soundMachine: 'electric' }).soundMachine).toBe('desk');
  });

  it('ring the bell on every new line unless told otherwise', () => {
    expect(DEFAULT_SETTINGS.soundBell).toBe('return');
    expect(resolveSettings({ soundBell: 'loud' }).soundBell).toBe('return');
    expect(resolveSettings({ soundBell: 'margin' }).soundBell).toBe('margin');
    expect(resolveSettings({ soundBell: 'off' }).soundBell).toBe('off');
  });
});

describe('carriageEvents', () => {
  // A 600 px line of 10 px characters: the bell point is 7 characters from the end, at 530 px.
  const place = (line: number, x: number): CaretPlace => ({ line, x, width: 600, charWidth: 10 });

  it('rings once, when the caret passes the bell point', () => {
    expect(carriageEvents(place(0, 510), place(0, 520)).bell).toBe(false);
    expect(carriageEvents(place(0, 520), place(0, 530)).bell).toBe(true);
    expect(carriageEvents(place(0, 530), place(0, 540)).bell).toBe(false);
  });

  it('reports a wrap, with how far the carriage must travel back, and no bell', () => {
    expect(carriageEvents(place(0, 590), place(1, 40))).toEqual({ bell: false, wrapped: true, travel: 590 / 600 });
    expect(carriageEvents(place(2, 300), place(3, 0)).travel).toBe(0.5);
  });

  it('is silent when the caret place was unknown, moved up a line, or the line is too narrow for a bell', () => {
    expect(carriageEvents(null, place(0, 560))).toEqual({ bell: false, wrapped: false, travel: 0 });
    expect(carriageEvents(place(1, 10), place(0, 560))).toMatchObject({ bell: false, wrapped: false });
    const narrow = (x: number): CaretPlace => ({ line: 0, x, width: 50, charWidth: 10 });
    expect(carriageEvents(narrow(0), narrow(10)).bell).toBe(false);
  });
});
