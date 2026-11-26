import { Errors } from './errors';

export const DEFAULT_TIMEZONE = 'Africa/Nairobi';
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns YYYY-MM-DD in Africa/Nairobi timezone (UTC+3).
 */
export function getNairobiDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: DEFAULT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Returns current hour (0-23) in Africa/Nairobi.
 */
export function getNairobiHour(date: Date = new Date()): number {
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: DEFAULT_TIMEZONE,
    hour: '2-digit',
    hour12: false,
  }).format(date);
  return Number(hourStr);
}

/**
 * Formats an instant as a friendly Nairobi date/time label.
 */
export function getNairobiDateTimeLabel(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-KE', {
    timeZone: DEFAULT_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/**
 * Parses a YYYY-MM-DD calendar date string into a UTC-midnight Date suitable for @db.Date.
 */
export function parseDateOnly(dateStr: string, fieldName = 'date'): Date {
  if (!DATE_ONLY_REGEX.test(dateStr)) {
    throw Errors.validation(`Invalid ${fieldName} format. Expected YYYY-MM-DD.`);
  }
  const parsed = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateStr) {
    throw Errors.validation(`Invalid calendar ${fieldName}: ${dateStr}`);
  }
  return parsed;
}

/**
 * Formats a @db.Date value returned by Prisma back into YYYY-MM-DD.
 */
export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Shifts a YYYY-MM-DD calendar date string by deltaDays.
 */
export function shiftDateString(dateStr: string, deltaDays: number): string {
  const base = parseDateOnly(dateStr);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return formatDateOnly(base);
}
