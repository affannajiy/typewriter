/**
 * Sound recording with the browser's MediaRecorder. Nothing leaves the
 * device: the recording is kept in memory while it runs and handed back as
 * bytes when it stops, for the caller to store.
 */

/** Formats to ask for, best first. Chromium and Firefox record Opus in WebM or Ogg; Safari records AAC in MP4. */
export const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'] as const;

/** Speech needs far less than music: 64 kbit/s keeps an hour near 30 MB. */
const BITS_PER_SECOND = 64_000;

export type RecorderFailure = 'unsupported' | 'denied' | 'no-device' | 'failed';

export class RecorderError extends Error {
  constructor(readonly reason: RecorderFailure) {
    super(reason);
    this.name = 'RecorderError';
  }
}

export interface FinishedRecording {
  bytes: ArrayBuffer;
  mimeType: string;
  durationMs: number;
}

export interface ActiveRecording {
  mimeType: string;
  /** Recorded time so far, without pauses. */
  elapsedMs: () => number;
  /** Bytes recorded so far. */
  size: () => number;
  paused: () => boolean;
  pause: () => void;
  resume: () => void;
  /** Ends the recording and releases the microphone. */
  stop: () => Promise<FinishedRecording>;
}

export function recordingSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

export function pickMimeType(isSupported: (type: string) => boolean = (type) => MediaRecorder.isTypeSupported(type)): string {
  return RECORDING_TYPES.find((type) => isSupported(type)) ?? '';
}

function failure(error: unknown): RecorderError {
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return new RecorderError('denied');
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return new RecorderError('no-device');
  return new RecorderError('failed');
}

/**
 * Asks for the microphone and starts recording. `onChunk` hears the size so
 * far, so the caller can stop before a file grows too large.
 */
export async function startRecording(onChunk: (size: number) => void = () => {}, now: () => number = () => performance.now()): Promise<ActiveRecording> {
  if (!recordingSupported()) throw new RecorderError('unsupported');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    throw failure(error);
  }
  const wanted = pickMimeType();
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { ...(wanted ? { mimeType: wanted } : {}), audioBitsPerSecond: BITS_PER_SECOND });
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw failure(error);
  }

  const chunks: Blob[] = [];
  let size = 0;
  let recorded = 0;
  let since: number | null = now();
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size === 0) return;
    chunks.push(event.data);
    size += event.data.size;
    onChunk(size);
  });
  // Ask for a piece every second, so the size is known while recording.
  recorder.start(1000);

  const elapsedMs = () => recorded + (since === null ? 0 : now() - since);
  const release = () => stream.getTracks().forEach((track) => track.stop());

  return {
    mimeType: recorder.mimeType || wanted || 'audio/webm',
    elapsedMs,
    size: () => size,
    paused: () => since === null,
    pause: () => {
      if (since === null || recorder.state !== 'recording') return;
      recorder.pause();
      recorded += now() - since;
      since = null;
    },
    resume: () => {
      if (since !== null || recorder.state !== 'paused') return;
      recorder.resume();
      since = now();
    },
    stop: () =>
      new Promise<FinishedRecording>((resolve, reject) => {
        const durationMs = Math.round(elapsedMs());
        since = null;
        recorded = durationMs;
        const finish = async () => {
          release();
          const type = recorder.mimeType || wanted || 'audio/webm';
          try {
            const bytes = await new Blob(chunks, { type }).arrayBuffer();
            resolve({ bytes, mimeType: type, durationMs });
          } catch (error) {
            reject(failure(error));
          }
        };
        if (recorder.state === 'inactive') void finish();
        else {
          recorder.addEventListener('stop', () => void finish(), { once: true });
          recorder.stop();
        }
      }),
  };
}

/** "1:05" or "1:02:03". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/** A file extension for a downloaded recording. */
export function audioExtension(mimeType: string): string {
  const type = mimeType.toLowerCase();
  if (type.includes('webm')) return 'webm';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('mp4') || type.includes('aac') || type.includes('m4a')) return 'm4a';
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
  if (type.includes('wav')) return 'wav';
  return 'audio';
}
