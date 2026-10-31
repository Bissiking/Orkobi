import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** RFC 4648 sans padding, usage interne et secrets TOTP (RFC 6238). */
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0,
    value = 0,
    output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}
export function base32Decode(value: string): Buffer {
  const normalized = value.toUpperCase().replace(/=+$/u, '');
  let bits = 0,
    acc = 0;
  const bytes: number[] = [];
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('Encodage base32 invalide.');
    acc = (acc << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((acc >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
/** 160 bits, format de clé recommandé par RFC 6238 §4.1. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}
function hotp(secret: Buffer, counter: bigint): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', secret).update(message).digest();
  const offset = digest[digest.length - 1]! & 0xf;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return String(binary % 1_000_000).padStart(6, '0');
}
const period = 30;
export function totp(secret: string, at = Date.now()): string {
  return hotp(base32Decode(secret), BigInt(Math.floor(at / 1000 / period)));
}
/** Fenêtre de vérification ±1 pas de 30 secondes, comparaison à temps constant. */
export function verifyTotp(secret: string, code: string, at = Date.now()): boolean {
  return matchingTotpStep(secret, code, at) !== undefined;
}
export function matchingTotpStep(
  secret: string,
  code: string,
  at = Date.now(),
): number | undefined {
  if (!/^\d{6}$/u.test(code)) return undefined;
  const counter = BigInt(Math.floor(at / 1000 / period));
  const candidate = Buffer.from(code);
  for (const step of [counter - 1n, counter, counter + 1n]) {
    if (step < 0n) continue;
    const expected = Buffer.from(hotp(base32Decode(secret), step));
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected))
      return Number(step);
  }
  return undefined;
}
export function otpauthUrl(issuer: string, account: string, secret: string): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
/** Code de récupération unique « XXXXX-XXXXX » (48 bits base32). */
export function generateRecoveryCode(): string {
  const raw = base32Encode(randomBytes(6));
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
}
export const recoveryCodePattern = /^[A-Z2-7]{5}-[A-Z2-7]{5}$/u;
