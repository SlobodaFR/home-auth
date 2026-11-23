#!/usr/bin/env node
// Pre-deploy guard, run on the CI runner before anything touches the VPS.
//
// Compares the public key of the 1Password pair about to be deployed with the
// key the live service publishes on /.well-known/jwks.json. A valid but wrong
// pair would otherwise pass every other check and make the new container
// refuse to start (key mismatch with the volume files).
//
// Fail closed: mismatch, unreachable JWKS, bad response -> exit 1, naming only
// public key fingerprints (SHA-256 of the SPKI DER, same as the app's log).
// Deliberate rotation or a first deploy: set JWT_KEY_ROTATION=1.
import { createHash, createPublicKey } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const sha256 = (der) => createHash('sha256').update(der).digest('hex');

export function fingerprintFromPem(pem) {
  return sha256(createPublicKey(pem).export({ type: 'spki', format: 'der' }));
}

/** Rebuilds the SPKI DER from the JWK modulus/exponent, then hashes it. */
export function fingerprintFromJwk(jwk) {
  return sha256(
    createPublicKey({ key: jwk, format: 'jwk' }).export({
      type: 'spki',
      format: 'der',
    }),
  );
}

export function isRotationEnabled(value) {
  return value === '1';
}

async function fetchLiveFingerprints(jwksUrl, fetchImpl) {
  const response = await fetchImpl(jwksUrl, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status.toString()}`);
  }
  const body = await response.json();
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  const fingerprints = keys
    .filter((key) => key?.kty === 'RSA' && key.n && key.e)
    .map((key) => fingerprintFromJwk(key));
  if (fingerprints.length === 0) {
    throw new Error('no RSA key in the JWKS');
  }
  return fingerprints;
}

export async function checkLiveJwks({
  jwksUrl,
  expectedPem,
  rotation = false,
  fetchImpl = fetch,
}) {
  const expected = fingerprintFromPem(expectedPem);
  let live;
  try {
    live = await fetchLiveFingerprints(jwksUrl, fetchImpl);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    if (rotation) {
      return {
        ok: true,
        status: 'rotation',
        message: `JWT_KEY_ROTATION=1: live JWKS not checked (${reason}); deploying public key sha256:${expected}`,
      };
    }
    return {
      ok: false,
      status: 'unreachable',
      message: `Cannot read the live JWKS (${reason}): refusing to deploy unverified JWT keys. Public key to deploy: sha256:${expected}. For a first deploy or a deliberate rotation, set the repository variable JWT_KEY_ROTATION=1.`,
    };
  }
  if (live.includes(expected)) {
    return {
      ok: true,
      status: 'match',
      message: `Live JWKS matches the 1Password public key: sha256:${expected}`,
    };
  }
  const liveList = live.map((fp) => `sha256:${fp}`).join(', ');
  if (rotation) {
    return {
      ok: true,
      status: 'rotation',
      message: `JWT_KEY_ROTATION=1: deploying public key sha256:${expected} over the live key ${liveList}`,
    };
  }
  return {
    ok: false,
    status: 'mismatch',
    message: `JWT key mismatch: 1Password public key sha256:${expected} differs from the live key ${liveList}. Deploying it would crash-loop the service or invalidate every session. Fix the 1Password value, or set the repository variable JWT_KEY_ROTATION=1 for a deliberate rotation.`,
  };
}

async function main() {
  const { AUTH_BASE_URL, JWT_PUBLIC_KEY_B64, JWT_KEY_ROTATION } = process.env;
  if (!AUTH_BASE_URL || !JWT_PUBLIC_KEY_B64) {
    console.error('AUTH_BASE_URL and JWT_PUBLIC_KEY_B64 are required');
    process.exit(1);
  }
  const result = await checkLiveJwks({
    jwksUrl: `${AUTH_BASE_URL.replace(/\/+$/, '')}/.well-known/jwks.json`,
    expectedPem: Buffer.from(JWT_PUBLIC_KEY_B64, 'base64').toString('utf8'),
    rotation: isRotationEnabled(JWT_KEY_ROTATION),
  });
  if (result.ok) {
    console.log(result.message);
  } else {
    console.error(result.message);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
