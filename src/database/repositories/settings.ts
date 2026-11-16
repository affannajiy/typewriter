import { db } from '@/database/db';
import { type AppSettings, type SettingKey, isValidSetting } from '@/features/settings/model';
import { RepositoryError, now } from './common';

/** Raw stored values by key. Validate with resolveSettings() before use. */
export async function readSettings(): Promise<Record<string, unknown>> {
  const rows = await db.settings.toArray();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function writeSetting<K extends SettingKey>(key: K, value: AppSettings[K]): Promise<void> {
  if (!isValidSetting(key, value)) throw new RepositoryError('invalid-colour', `Invalid value for setting ${key}`);
  await db.settings.put({ key, value, updatedAt: now() });
}
