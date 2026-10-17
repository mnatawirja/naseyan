/** Staff PIN hashing. PINs never leave the server and are stored only in staffSecrets/{staffId}. */
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const PIN_RE = /^\d{6}$/;
export function weakPin(pin: string): boolean {
  return /^(\d)\1{5}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin);
}
export async function hashPin(pin: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16);
  const hash = await scrypt(pin, salt, 32);
  return { salt: salt.toString('base64'), hash: hash.toString('base64') };
}
export async function verifyPin(pin: string, stored: { salt: string; hash: string }): Promise<boolean> {
  const h = await scrypt(pin, Buffer.from(stored.salt, 'base64'), 32);
  const want = Buffer.from(stored.hash, 'base64');
  return h.length === want.length && timingSafeEqual(h, want);
}
