import { createHash, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const SCRYPT_KEYLEN = 64;
/** Used when there is no stored hash, so an unknown client costs the same scrypt as a known one. */
const DUMMY_SALT = '00000000000000000000000000000000';

// Runs in the libuv threadpool: never blocks the event loop (unlike scryptSync).
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

/**
 * Deterministic SHA-256 digest, used for single-use/lookup tokens (magic
 * links, authorization codes, refresh tokens) where only equality checks
 * against a stored hash are needed.
 */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Salted scrypt hash for long-lived secrets (client secrets), stored as
 * `salt:hash` hex pairs. Use `verifySecret` for constant-time comparison.
 * Parameters (16-byte hex salt, keylen 64, Node's default cost) must not change:
 * stored secrets depend on them.
 */
export async function hashSecret(rawSecret: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(rawSecret, salt, SCRYPT_KEYLEN);
  return `${salt}:${derived.toString('hex')}`;
}

/**
 * Constant-time check of a secret against its stored hash. A null or malformed hash (unknown
 * client) still pays one scrypt, so response time does not reveal which client ids exist.
 */
export async function verifySecret(
  rawSecret: string,
  storedHash: string | null,
): Promise<boolean> {
  const [salt, derived] = storedHash?.split(':') ?? [];
  if (!salt || !derived) {
    await scryptAsync(rawSecret, DUMMY_SALT, SCRYPT_KEYLEN);
    return false;
  }
  const candidate = await scryptAsync(rawSecret, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(derived, 'hex');
  if (candidate.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(candidate, expected);
}
