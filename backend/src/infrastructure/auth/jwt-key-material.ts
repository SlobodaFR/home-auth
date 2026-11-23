import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Where the RS256 signing keys come from, in order of precedence:
 * environment (when both keys are provided), then the PEM files in the data
 * volume, then a freshly generated pair persisted in the volume.
 *
 * Fail closed: when env keys and volume files coexist they must be the same
 * key pair, otherwise the service refuses to start. A wrong secret must never
 * silently rotate the signing key and invalidate every session. Errors name
 * public key fingerprints only, never key material.
 */
export interface JwtKeyEnv {
  /** Raw PEM, or PEM with literal "\n" sequences. */
  JWT_PRIVATE_KEY?: string;
  JWT_PUBLIC_KEY?: string;
  /** Base64 of the PEM: a single line, safe in a docker compose .env file. */
  JWT_PRIVATE_KEY_B64?: string;
  JWT_PUBLIC_KEY_B64?: string;
}

export type JwtKeySource = 'env' | 'files' | 'env+files' | 'generated';

export interface JwtKeyMaterial {
  source: JwtKeySource;
  privateKeyPem: string;
  /**
   * The text the key id is derived from. For keys that live in the volume this
   * is the file content byte for byte, so the kid never changes when the same
   * key is later supplied through the environment.
   */
  publicKeyPem: string;
  /** SHA-256 of the SPKI DER of the public key, hex. */
  fingerprint: string;
}

const PRIVATE_FILE = 'jwt-private.pem';
const PUBLIC_FILE = 'jwt-public.pem';

export class JwtKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JwtKeyError';
  }
}

export function publicKeyFingerprint(publicKey: KeyObject): string {
  return createHash('sha256')
    .update(publicKey.export({ type: 'spki', format: 'der' }))
    .digest('hex');
}

const label = (fingerprint: string): string => `sha256:${fingerprint}`;

interface Pair {
  privateKeyPem: string;
  publicKeyPem: string;
  fingerprint: string;
}

export function resolveJwtKeyMaterial(options: {
  env: JwtKeyEnv;
  dataDir: string;
}): JwtKeyMaterial {
  const { env, dataDir } = options;
  const privatePath = join(dataDir, PRIVATE_FILE);
  const publicPath = join(dataDir, PUBLIC_FILE);
  const hasPrivateFile = existsSync(privatePath);
  const hasPublicFile = existsSync(publicPath);

  const envPem = readEnvPems(env);
  if (envPem) {
    const fromEnv = parsePair('the environment', envPem, true);
    if (!hasPrivateFile && !hasPublicFile) {
      return { source: 'env', ...fromEnv };
    }
    if (!hasPrivateFile || !hasPublicFile) {
      throw new JwtKeyError(
        `Refusing to start: only one of ${PRIVATE_FILE} and ${PUBLIC_FILE} exists in the volume, so the environment keys (public key ${label(fromEnv.fingerprint)}) cannot be checked against it. Restore the missing file; nothing was modified.`,
      );
    }
    const fromFiles = parsePair('the volume files', {
      privateKeyPem: readFileSync(privatePath, 'utf8'),
      publicKeyPem: readFileSync(publicPath, 'utf8'),
    });
    if (fromFiles.fingerprint !== fromEnv.fingerprint) {
      throw new JwtKeyError(
        `JWT key mismatch, refusing to start: the key pair from the environment (public key ${label(fromEnv.fingerprint)}) differs from the one in the volume (public key ${label(fromFiles.fingerprint)}). Starting would rotate the signing key and invalidate every session. Fix the 1Password value, or follow the rotation runbook if this is deliberate. Nothing was modified.`,
      );
    }
    // Same key: keep serving the volume's own PEM text (stable kid).
    return { source: 'env+files', ...fromFiles };
  }

  if (hasPrivateFile && hasPublicFile) {
    return {
      source: 'files',
      ...parsePair('the volume files', {
        privateKeyPem: readFileSync(privatePath, 'utf8'),
        publicKeyPem: readFileSync(publicPath, 'utf8'),
      }),
    };
  }

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(privatePath, privateKey, { mode: 0o600 });
  writeFileSync(publicPath, publicKey);
  return {
    source: 'generated',
    ...parsePair('the generated keys', {
      privateKeyPem: privateKey,
      publicKeyPem: publicKey,
    }),
  };
}

function readEnvPems(
  env: JwtKeyEnv,
): { privateKeyPem: string; publicKeyPem: string } | null {
  const privateKeyPem = readEnvPem(
    env,
    'JWT_PRIVATE_KEY',
    'JWT_PRIVATE_KEY_B64',
  );
  const publicKeyPem = readEnvPem(env, 'JWT_PUBLIC_KEY', 'JWT_PUBLIC_KEY_B64');
  if (!privateKeyPem && !publicKeyPem) {
    return null;
  }
  if (!privateKeyPem || !publicKeyPem) {
    throw new JwtKeyError(
      'JWT_PRIVATE_KEY[_B64] and JWT_PUBLIC_KEY[_B64] must be set together (only one of them is set)',
    );
  }
  return { privateKeyPem, publicKeyPem };
}

function readEnvPem(
  env: JwtKeyEnv,
  rawName: 'JWT_PRIVATE_KEY' | 'JWT_PUBLIC_KEY',
  b64Name: 'JWT_PRIVATE_KEY_B64' | 'JWT_PUBLIC_KEY_B64',
): string | undefined {
  const raw = env[rawName]?.trim();
  const encoded = env[b64Name]?.trim();
  if (raw && encoded) {
    throw new JwtKeyError(
      `${rawName} and ${b64Name} are both set: keep only one of them`,
    );
  }
  if (encoded) {
    const compact = encoded.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact) || compact.length % 4 !== 0) {
      throw new JwtKeyError(`${b64Name} is not valid base64`);
    }
    const pem = Buffer.from(compact, 'base64').toString('utf8');
    if (!pem.includes('-----BEGIN ')) {
      throw new JwtKeyError(`${b64Name} does not decode to a PEM document`);
    }
    return pem;
  }
  if (raw) {
    return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
  }
  return undefined;
}

function parsePair(
  origin: string,
  pems: { privateKeyPem: string; publicKeyPem: string },
  canonical = false,
): Pair {
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey(pems.privateKeyPem);
  } catch {
    throw new JwtKeyError(
      `The JWT private key in ${origin} is not a valid PEM private key`,
    );
  }
  let publicKey: KeyObject;
  try {
    publicKey = createPublicKey(pems.publicKeyPem);
  } catch {
    throw new JwtKeyError(
      `The JWT public key in ${origin} is not a valid PEM public key`,
    );
  }
  if (
    privateKey.asymmetricKeyType !== 'rsa' ||
    publicKey.asymmetricKeyType !== 'rsa'
  ) {
    throw new JwtKeyError(`The JWT keys in ${origin} must be RSA keys`);
  }
  const fingerprint = publicKeyFingerprint(publicKey);
  if (!isKeyPair(privateKey, publicKey)) {
    const derived = publicKeyFingerprint(createPublicKey(privateKey));
    throw new JwtKeyError(
      `The JWT private and public keys in ${origin} do not form a pair (public key ${label(fingerprint)}, private key belongs to ${label(derived)})`,
    );
  }
  if (!canonical) {
    return { ...pems, fingerprint };
  }
  // Env values may have lost their trailing newline or been re-wrapped:
  // re-export so the kid input equals the PEM a generated file would hold.
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    fingerprint,
  };
}

function isKeyPair(privateKey: KeyObject, publicKey: KeyObject): boolean {
  try {
    const challenge = Buffer.from('jwt-key-pair-check');
    return verify(
      'sha256',
      challenge,
      publicKey,
      sign('sha256', challenge, privateKey),
    );
  } catch {
    return false;
  }
}
