import { MilkingSession } from '../types/api';

export const NAIROBI_TZ = 'Africa/Nairobi';

export function formatKes(amount: number | string): string {
  const numeric = typeof amount === 'string' ? Number(amount) : amount;
  if (Number.isNaN(numeric)) return 'KES 0.00';
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

export function formatLitres(litres: number | string): string {
  const numeric = typeof litres === 'string' ? Number(litres) : litres;
  if (Number.isNaN(numeric)) return '0 L';
  const formatted = Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/0$/, '');
  return `${formatted} L`;
}

export function getNairobiTodayDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: NAIROBI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function getDefaultMilkingSession(): MilkingSession {
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: NAIROBI_TZ,
    hour: '2-digit',
    hour12: false,
  }).format(new Date());
  return Number(hourStr) < 13 ? 'MORNING' : 'EVENING';
}

export function formatNairobiDateTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat('en-KE', {
    timeZone: NAIROBI_TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatNairobiDate(isoString: string): string {
  const date = new Date(isoString.length === 10 ? `${isoString}T00:00:00Z` : isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat('en-KE', {
    timeZone: isoString.length === 10 ? 'UTC' : NAIROBI_TZ,
    dateStyle: 'medium',
  }).format(date);
}

/**
 * Generates clean 1-2 character initials for cow and user profile placeholders.
 */
export function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function formatActionLabel(action: string): string {
  const map: Record<string, string> = {
    'auth.registered': 'Owner account registered',
    'auth.login': 'Signed in',
    'auth.logout': 'Signed out',
    'farm.created': 'Farm created',
    'farm.updated': 'Farm settings updated',
    'farm.archived': 'Farm archived',
    'invitation.created': 'Assistant invited',
    'invitation.accepted': 'Assistant joined farm',
    'invitation.revoked': 'Invitation cancelled',
    'member.permissions_updated': 'Assistant permissions updated',
    'member.status_updated': 'Assistant access status changed',
    'animal.created': 'Cow added to herd',
    'animal.updated': 'Cow profile updated',
    'animal.archived': 'Cow archived',
    'milk.recorded': 'Milk production recorded',
    'milk.corrected': 'Milk record corrected',
    'customer.created': 'Customer added',
    'customer.updated': 'Customer updated',
    'delivery.recorded': 'Milk delivery recorded',
    'delivery.updated': 'Milk delivery updated',
    'payment.recorded': 'Customer payment recorded',
    'payment.voided': 'Payment voided',
  };
  return map[action] ?? action.replace(/[._]/g, ' ');
}
