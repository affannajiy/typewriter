/**
 * Base64 for file bytes in backups. Works in pieces, so a file of many
 * megabytes never builds one argument list too long for the engine.
 */

const CHUNK = 0x8000;

export function bytesToBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  const parts: string[] = [];
  for (let start = 0; start < view.length; start += CHUNK) {
    parts.push(String.fromCharCode(...view.subarray(start, start + CHUNK)));
  }
  return btoa(parts.join(''));
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Null when the text is not valid base64. */
export function base64ToBytes(text: string): ArrayBuffer | null {
  if (text.length % 4 !== 0 || !BASE64.test(text)) return null;
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    return null;
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out.buffer;
}
