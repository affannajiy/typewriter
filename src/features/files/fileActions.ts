import { type RefObject, useEffect } from 'react';
import { MAX_ATTACHMENT_BYTES, addAttachment, readAttachmentBytes } from '@/database/repositories/attachments';
import { RepositoryError } from '@/database/repositories/common';
import { t } from '@/i18n/en';
import { openPdf } from '@/services/pdf';
import { type FinishedRecording, audioExtension } from '@/services/recorder';
import { downloadBlob } from '@/services/storage';
import type { Attachment } from '@/types/models';
import { formatDateTime } from '@/utils/dates';

/** Thrown when a chosen file is not a PDF that PDF.js can open. */
export class NotPdfError extends Error {
  constructor() {
    super('Not a readable PDF');
    this.name = 'NotPdfError';
  }
}

const withoutExtension = (name: string) => name.replace(/\.[a-z0-9]{1,5}$/i, '');

/** Reads a chosen PDF, checks that PDF.js can open it, and stores it. */
export async function addPdfFile(file: File): Promise<Attachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new RepositoryError('file-too-large', 'File too large');
  const bytes = await file.arrayBuffer();
  let pageCount: number;
  try {
    const pdf = await openPdf(bytes);
    pageCount = pdf.pageCount;
    pdf.destroy();
  } catch (error) {
    console.error(error);
    throw new NotPdfError();
  }
  return addAttachment({ kind: 'pdf', name: withoutExtension(file.name), mimeType: 'application/pdf', bytes, pageCount });
}

/** The length of a sound file, read by the browser. Null when it cannot tell within a few seconds. */
export function probeDuration(bytes: ArrayBuffer, mimeType: string, timeoutMs = 3000): Promise<number | null> {
  if (typeof Audio === 'undefined' || typeof URL.createObjectURL !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    const audio = new Audio();
    const finish = (value: number | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', () => finish(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : null), { once: true });
    audio.addEventListener('error', () => finish(null), { once: true });
    audio.src = url;
  });
}

/** Reads a chosen sound file and stores it. */
export async function addAudioFile(file: File): Promise<Attachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new RepositoryError('file-too-large', 'File too large');
  const bytes = await file.arrayBuffer();
  const mimeType = file.type || 'audio/mpeg';
  const durationMs = await probeDuration(bytes, mimeType);
  return addAttachment({ kind: 'audio', name: withoutExtension(file.name), mimeType, bytes, durationMs });
}

export function saveRecording(recording: FinishedRecording, when = Date.now()): Promise<Attachment> {
  return addAttachment({
    kind: 'audio',
    name: t.files.recordingName(formatDateTime(when)),
    mimeType: recording.mimeType,
    bytes: recording.bytes,
    durationMs: recording.durationMs,
  });
}

/** A file name for downloading: the file's name, without characters file systems refuse, and an extension. */
export function downloadName(file: Attachment): string {
  const base = file.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'file';
  return `${base}.${file.kind === 'pdf' ? 'pdf' : audioExtension(file.mimeType)}`;
}

export async function downloadAttachment(file: Attachment): Promise<void> {
  const bytes = await readAttachmentBytes(file.id);
  downloadBlob(downloadName(file), new Blob([bytes], { type: file.mimeType }));
}

/** Points a media element at bytes through an object URL, released when the bytes change or the element goes. */
export function useObjectUrl(element: RefObject<HTMLMediaElement | null>, bytes: ArrayBuffer | null | undefined, type: string): void {
  useEffect(() => {
    const media = element.current;
    if (!bytes || !media || typeof URL.createObjectURL !== 'function') return;
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    media.setAttribute('src', url);
    return () => {
      media.removeAttribute('src');
      URL.revokeObjectURL(url);
    };
  }, [element, bytes, type]);
}
