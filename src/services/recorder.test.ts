import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecorderError, audioExtension, formatDuration, pickMimeType, recordingSupported, startRecording } from './recorder';

/** A stand-in for the browser's MediaRecorder: hands out a one-byte piece per requestData/stop. */
class FakeMediaRecorder extends EventTarget {
  static supported = new Set(['audio/webm;codecs=opus']);
  static isTypeSupported = (type: string) => FakeMediaRecorder.supported.has(type);
  static last: FakeMediaRecorder | null = null;
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType: string;
  options: MediaRecorderOptions;
  constructor(_stream: MediaStream, options: MediaRecorderOptions = {}) {
    super();
    this.options = options;
    this.mimeType = options.mimeType ?? '';
    FakeMediaRecorder.last = this;
  }
  start() {
    this.state = 'recording';
  }
  pause() {
    this.state = 'paused';
  }
  resume() {
    this.state = 'recording';
  }
  emit(bytes: number[]) {
    const event = new Event('dataavailable') as Event & { data: Blob };
    event.data = new Blob([new Uint8Array(bytes)]);
    this.dispatchEvent(event);
  }
  stop() {
    this.emit([9]);
    this.state = 'inactive';
    this.dispatchEvent(new Event('stop'));
  }
}

const stopped = vi.fn();
function installMicrophone(getUserMedia: () => Promise<unknown> = () => Promise.resolve({ getTracks: () => [{ stop: stopped }] })) {
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(getUserMedia) } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  stopped.mockClear();
});

describe('recording', () => {
  it('is not offered where the browser cannot record', async () => {
    expect(recordingSupported()).toBe(false);
    await expect(startRecording()).rejects.toMatchObject({ reason: 'unsupported' });
  });

  it('picks the first format the browser records', () => {
    expect(pickMimeType((type) => type === 'audio/mp4')).toBe('audio/mp4');
    expect(pickMimeType((type) => type.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(pickMimeType(() => false)).toBe('');
  });

  it('records, pauses without counting the pause, and hands back the bytes, releasing the microphone', async () => {
    installMicrophone();
    let clock = 0;
    const sizes: number[] = [];
    const recording = await startRecording((size) => sizes.push(size), () => clock);
    expect(FakeMediaRecorder.last?.options).toMatchObject({ mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 64_000 });

    clock = 3000;
    FakeMediaRecorder.last!.emit([1, 2, 3]);
    recording.pause();
    expect(recording.paused()).toBe(true);
    clock = 10_000; // Paused: does not count.
    recording.resume();
    clock = 12_500;
    expect(recording.elapsedMs()).toBe(5500);
    expect(sizes).toEqual([3]);

    const done = await recording.stop();
    expect(done.durationMs).toBe(5500);
    expect(done.mimeType).toBe('audio/webm;codecs=opus');
    expect([...new Uint8Array(done.bytes)]).toEqual([1, 2, 3, 9]);
    expect(stopped).toHaveBeenCalled();
  });

  it('explains a refused or missing microphone', async () => {
    installMicrophone(() => Promise.reject(new DOMException('no', 'NotAllowedError')));
    await expect(startRecording()).rejects.toEqual(new RecorderError('denied'));
    installMicrophone(() => Promise.reject(new DOMException('no', 'NotFoundError')));
    await expect(startRecording()).rejects.toMatchObject({ reason: 'no-device' });
    installMicrophone(() => Promise.reject(new Error('odd')));
    await expect(startRecording()).rejects.toMatchObject({ reason: 'failed' });
  });
});

describe('recording helpers', () => {
  it('formats a length as minutes and seconds, or hours', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65_400)).toBe('1:05');
    expect(formatDuration(3_723_000)).toBe('1:02:03');
    expect(formatDuration(-5)).toBe('0:00');
  });

  it('names a downloaded file by its format', () => {
    expect(audioExtension('audio/webm;codecs=opus')).toBe('webm');
    expect(audioExtension('audio/ogg;codecs=opus')).toBe('ogg');
    expect(audioExtension('audio/mp4')).toBe('m4a');
    expect(audioExtension('audio/mpeg')).toBe('mp3');
    expect(audioExtension('audio/wav')).toBe('wav');
    expect(audioExtension('audio/x-unknown')).toBe('audio');
  });
});
