import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  tv: number;
}

export function signAccessToken(userId: string, tokenVersion: number): string {
  const payload: AccessTokenPayload = { sub: userId, tv: tokenVersion };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
  if (!decoded || typeof decoded.sub !== 'string' || typeof decoded.tv !== 'number') {
    throw new Error('Invalid access token payload');
  }
  return { sub: decoded.sub, tv: decoded.tv };
}

export function generateOpaqueToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256Hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generates an easy-to-read 8-character invite code formatted as XXXX-XXXX.
 * Avoids confusing characters (0, O, 1, I) so farmers can share it easily over voice/SMS/WhatsApp.
 */
export function generateInviteCode(): string {
  const bytes = crypto.randomBytes(8);
  let raw = '';
  for (let i = 0; i < 8; i++) {
    raw += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function normalizeInviteCode(input: string): string {
  const stripped = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (stripped.length !== 8) {
    return stripped;
  }
  return `${stripped.slice(0, 4)}-${stripped.slice(4)}`;
}
