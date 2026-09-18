import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const SCRYPT_PREFIX = 'scrypt';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');

  return `${SCRYPT_PREFIX}:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');

  if (parts.length !== 3 || parts[0] !== SCRYPT_PREFIX) {
    return false;
  }

  const salt = parts[1] ?? '';
  const expected = Buffer.from(parts[2] ?? '', 'hex');

  if (salt.length === 0 || expected.length === 0) {
    return false;
  }

  const actual = scryptSync(password, salt, expected.length);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function generatePassword(length = 12): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  return Array.from(randomBytes(length))
    .map((byte) => alphabet[byte % alphabet.length])
    .join('');
}
