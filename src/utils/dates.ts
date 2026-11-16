/** Date formatting goes through Intl, so it follows the user's locale. */

const longDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const timeOnly = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export const formatLongDate = (time: number | Date) => longDate.format(time);
export const formatDateTime = (time: number | Date) => shortDateTime.format(time);
export const formatTime = (time: number | Date) => timeOnly.format(time);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "5 minutes ago", "yesterday", or a full date once it is over a week old. */
export function formatRelative(time: number, now = Date.now()): string {
  const diff = time - now;
  const abs = Math.abs(diff);
  if (abs < MINUTE) return relative.format(0, 'minute');
  if (abs < HOUR) return relative.format(Math.round(diff / MINUTE), 'minute');
  if (abs < DAY) return relative.format(Math.round(diff / HOUR), 'hour');
  if (abs < 7 * DAY) return relative.format(Math.round(diff / DAY), 'day');
  return formatDateTime(time);
}

/** The local calendar day, as `YYYY-MM-DD`. Sorts as text in date order. */
export function dayKey(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The day `days` before (or after, if negative) the given one, at local midnight. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
export const formatWeekday = (time: number | Date) => weekdayShort.format(time);

export type DayPart ='morning' | 'afternoon' | 'evening';

export function dayPart(date = new Date()): DayPart {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}
