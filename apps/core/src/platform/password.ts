import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt);
  return `scrypt:131072:8:1:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const parts = hash.split(':');
  if (
    parts.length !== 6 ||
    parts.slice(0, 4).join(':') !== 'scrypt:131072:8:1' ||
    !/^[a-f0-9]{32}$/u.test(parts[4]!) ||
    !/^[a-f0-9]{128}$/u.test(parts[5]!)
  )
    return false;
  const key = await derive(password, parts[4]!);
  return timingSafeEqual(key, Buffer.from(parts[5]!, 'hex'));
}
/** Même coût de dérivation pour un compte absent. */
export const dummyPasswordHash = `scrypt:131072:8:1:${'0'.repeat(32)}:${'0'.repeat(128)}`;
