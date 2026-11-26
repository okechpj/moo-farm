import { describe, expect, it } from 'vitest';
import { isLikelyEmail, normalizePhoneNumber } from '../src/utils/phone';
import { generateInviteCode, normalizeInviteCode } from '../src/utils/tokens';

describe('Kenyan phone normalization', () => {
  it('normalizes local 07XX and 01XX formats to +254 E.164', () => {
    expect(normalizePhoneNumber('0712345678')).toBe('+254712345678');
    expect(normalizePhoneNumber('0712 345 678')).toBe('+254712345678');
    expect(normalizePhoneNumber('0110-123-456')).toBe('+254110123456');
  });

  it('normalizes 9-digit shorthand and 254 prefix formats', () => {
    expect(normalizePhoneNumber('712345678')).toBe('+254712345678');
    expect(normalizePhoneNumber('254712345678')).toBe('+254712345678');
    expect(normalizePhoneNumber('+254712345678')).toBe('+254712345678');
  });

  it('rejects invalid phone strings', () => {
    expect(() => normalizePhoneNumber('')).toThrow();
    expect(() => normalizePhoneNumber('12345')).toThrow();
    expect(() => normalizePhoneNumber('not-a-phone')).toThrow();
  });

  it('detects email vs phone identifiers', () => {
    expect(isLikelyEmail('owner@moofarm.ke')).toBe(true);
    expect(isLikelyEmail('0712345678')).toBe(false);
  });
});

describe('Invite codes', () => {
  it('generates formatted 8-character codes and normalizes user input', () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(normalizeInviteCode('ab23 cd45')).toBe('AB23-CD45');
  });
});
