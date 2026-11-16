import { BackupError } from '@/database/backup/validate';
import { RepositoryError } from '@/database/repositories/common';
import { t } from '@/i18n/en';

/**
 * Turn any thrown value into a message for the user: what happened and what
 * to do. Internal details (stack, error names) go to the console only.
 */
export function describeError(error: unknown): string {
  console.error(error);
  if (error instanceof BackupError) return t.errors.backup[error.code](error.detail);
  if (error instanceof RepositoryError) return t.errors.repository[error.code];
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return t.errors.quota;
  if (error instanceof Error && (error.name === 'QuotaExceededError' || /quota/i.test(error.message))) return t.errors.quota;
  return t.errors.unknown;
}
