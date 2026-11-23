import assert from 'node:assert/strict';
import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { test } from 'node:test';
import {
  checkLiveJwks,
  fingerprintFromJwk,
  fingerprintFromPem,
  isRotationEnabled,
} from './check-live-jwks.mjs';

const pair = () =>
  generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
const jwkOf = (pem) => createPublicKey(pem).export({ format: 'jwk' });
const jwksResponse = (...pems) => ({
  ok: true,
  status: 200,
  json: () =>
    Promise.resolve({
      keys: pems.map((pem) => ({ ...jwkOf(pem), kid: 'k', alg: 'RS256' })),
    }),
});

const keyA = pair();
const keyB = pair();
const url = 'https://auth.example.test/.well-known/jwks.json';

test('n/e rebuilt into SPKI DER hashes like openssl does', () => {
  const der = execFileSync('openssl', ['pkey', '-pubin', '-outform', 'DER'], {
    input: keyA.publicKey,
  });
  const expected = createHash('sha256').update(der).digest('hex');

  assert.equal(fingerprintFromJwk(jwkOf(keyA.publicKey)), expected);
  assert.equal(fingerprintFromPem(keyA.publicKey), expected);
});

test('passes when the live key is the 1Password key', async () => {
  const result = await checkLiveJwks({
    jwksUrl: url,
    expectedPem: keyA.publicKey,
    fetchImpl: () => Promise.resolve(jwksResponse(keyA.publicKey)),
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'match');
});

test('fails on a different key, naming only both fingerprints', async () => {
  const result = await checkLiveJwks({
    jwksUrl: url,
    expectedPem: keyB.publicKey,
    fetchImpl: () => Promise.resolve(jwksResponse(keyA.publicKey)),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'mismatch');
  assert.ok(result.message.includes(fingerprintFromPem(keyA.publicKey)));
  assert.ok(result.message.includes(fingerprintFromPem(keyB.publicKey)));
  assert.ok(!result.message.includes('BEGIN'));
  assert.ok(!result.message.includes(jwkOf(keyA.publicKey).n));
});

test('fails closed when the live JWKS is unreachable', async () => {
  const result = await checkLiveJwks({
    jwksUrl: url,
    expectedPem: keyA.publicKey,
    fetchImpl: () => Promise.reject(new Error('connect ECONNREFUSED')),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unreachable');
  assert.match(result.message, /JWT_KEY_ROTATION/);
});

test('fails closed on HTTP error, invalid JSON and empty key set', async () => {
  const bad = [
    { ok: false, status: 502, json: () => Promise.resolve({}) },
    { ok: true, status: 200, json: () => Promise.reject(new Error('bad')) },
    { ok: true, status: 200, json: () => Promise.resolve({ keys: [] }) },
    {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ keys: [{ kty: 'EC' }] }),
    },
  ];
  for (const response of bad) {
    const result = await checkLiveJwks({
      jwksUrl: url,
      expectedPem: keyA.publicKey,
      fetchImpl: () => Promise.resolve(response),
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'unreachable');
  }
});

test('JWT_KEY_ROTATION=1 allows an unreachable JWKS and a different key', async () => {
  const unreachable = await checkLiveJwks({
    jwksUrl: url,
    expectedPem: keyA.publicKey,
    rotation: true,
    fetchImpl: () => Promise.reject(new Error('down')),
  });
  const rotated = await checkLiveJwks({
    jwksUrl: url,
    expectedPem: keyB.publicKey,
    rotation: true,
    fetchImpl: () => Promise.resolve(jwksResponse(keyA.publicKey)),
  });
  assert.equal(unreachable.ok, true);
  assert.equal(unreachable.status, 'rotation');
  assert.equal(rotated.ok, true);
  assert.equal(rotated.status, 'rotation');
  assert.ok(rotated.message.includes(fingerprintFromPem(keyA.publicKey)));
  assert.ok(rotated.message.includes(fingerprintFromPem(keyB.publicKey)));
});

test('only the exact value 1 enables the rotation opt-in', () => {
  assert.equal(isRotationEnabled('1'), true);
  for (const value of [undefined, '', '0', 'true', 'yes', ' 1 x']) {
    assert.equal(isRotationEnabled(value), false);
  }
});

test('CLI: exit codes against a real HTTP server', async () => {
  let served = keyA.publicKey;
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [{ ...jwkOf(served), kid: 'k' }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  // Async spawn: a sync one would block the event loop serving the JWKS.
  const run = (extra) =>
    new Promise((resolve) => {
      execFile(
        process.execPath,
        [new URL('./check-live-jwks.mjs', import.meta.url).pathname],
        {
          env: {
            PATH: process.env.PATH,
            AUTH_BASE_URL: `http://127.0.0.1:${port}/`,
            JWT_PUBLIC_KEY_B64: Buffer.from(keyA.publicKey).toString('base64'),
            ...extra,
          },
        },
        (error, stdout, stderr) =>
          resolve({ status: error ? error.code : 0, stdout, stderr }),
      );
    });
  try {
    assert.equal((await run({})).status, 0);
    served = keyB.publicKey;
    const mismatch = await run({});
    assert.equal(mismatch.status, 1);
    assert.ok(mismatch.stderr.includes(fingerprintFromPem(keyB.publicKey)));
    const rotation = await run({ JWT_KEY_ROTATION: '1' });
    assert.equal(rotation.status, 0);
    assert.ok(rotation.stdout.includes('::warning::'));
  } finally {
    server.close();
  }
  const down = await run({ AUTH_BASE_URL: 'http://127.0.0.1:1' });
  assert.equal(down.status, 1);
  assert.equal(
    (await run({ AUTH_BASE_URL: 'http://127.0.0.1:1', JWT_KEY_ROTATION: '1' }))
      .status,
    0,
  );
});
