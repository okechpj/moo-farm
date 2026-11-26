import { Errors } from './errors';

/**
 * Normalizes Kenyan (and general E.164) phone numbers into canonical +254XXXXXXXXX format.
 * Examples:
 * - "0712 345 678"   -> "+254712345678"
 * - "0110-123-456"   -> "+254110123456"
 * - "712345678"      -> "+254712345678"
 * - "254712345678"   -> "+254712345678"
 * - "+254712345678"  -> "+254712345678"
 */
export function normalizePhoneNumber(raw: string): string {
  const cleaned = raw.trim().replace(/[\s\-().]/g, '');

  if (!cleaned) {
    throw Errors.validation('Phone number is required');
  }

  // Kenyan local format: 07XXXXXXXX or 01XXXXXXXX (10 digits)
  if (/^0[17]\d{8}$/.test(cleaned)) {
    return `+254${cleaned.slice(1)}`;
  }

  // Kenyan shorthand without leading zero: 7XXXXXXXX or 1XXXXXXXX (9 digits)
  if (/^[17]\d{8}$/.test(cleaned)) {
    return `+254${cleaned}`;
  }

  // Kenyan without plus: 2547XXXXXXXX or 2541XXXXXXXX (12 digits)
  if (/^254[17]\d{8}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  // Kenyan canonical E.164: +2547XXXXXXXX or +2541XXXXXXXX
  if (/^\+254[17]\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  // General international E.164 fallback (+ followed by 8-15 digits)
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) {
    return cleaned;
  }

  throw Errors.validation(
    'Please enter a valid Kenyan phone number (for example 0712345678 or +254712345678)',
  );
}

export function isLikelyEmail(identifier: string): boolean {
  return identifier.includes('@');
}
