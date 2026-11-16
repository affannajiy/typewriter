/**
 * Browser storage facts. IndexedDB is browser-managed storage, not a
 * guaranteed archive: the browser may evict it unless persistence is granted.
 */

export interface StorageInfo {
  /** Bytes used by this site, or null when the browser does not report it. */
  usage: number | null;
  quota: number | null;
  /** True when the browser has promised not to evict the data. */
  persisted: boolean;
  canPersist: boolean;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (!storage?.estimate) return { usage: null, quota: null, persisted: false, canPersist: false };
  const { usage, quota } = await storage.estimate();
  return {
    usage: usage ?? null,
    quota: quota ?? null,
    persisted: (await storage.persisted?.()) ?? false,
    canPersist: typeof storage.persist === 'function',
  };
}

/** Ask the browser to keep the data. The browser may refuse without a prompt. */
export async function requestPersistence(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false;
}

/** Usage is "low on space" at 80% of the quota. */
export const LOW_STORAGE_RATIO = 0.8;

export function isStorageLow(info: StorageInfo): boolean {
  return info.usage !== null && info.quota !== null && info.quota > 0 && info.usage / info.quota >= LOW_STORAGE_RATIO;
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
}

/** Hand a file to the browser's download flow. Nothing leaves the device. */
export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke after the click has been handled, so the download can start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Hand a text file to the browser's download flow. */
export function downloadTextFile(name: string, text: string, type = 'application/json'): void {
  downloadBlob(name, new Blob([text], { type }));
}
