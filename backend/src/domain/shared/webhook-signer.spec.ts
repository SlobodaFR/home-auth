import {
  buildWebhookSignatureHeader,
  computeWebhookSignature,
} from './webhook-signer';

/**
 * FIXED test vectors (contract PC7). Consumer apps copy them verbatim into their own tests
 * and into README.md: any change here is a change of the contract. Cross-checked with
 * `printf '%s' '<id>.<timestamp>.<body>' | openssl dgst -sha256 -hmac <secret>`: the key is
 * the secret string itself (its 64 hex characters, UTF-8), NOT its decoded bytes.
 */
const SECRET_1 =
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const SECRET_2 =
  'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100';

describe('webhook signer test vectors', () => {
  it('vector 1: HMAC-SHA256(secret, id.timestamp.rawBody)', () => {
    expect(
      computeWebhookSignature(
        SECRET_1,
        '3b241101-e2bb-4255-8caf-4136c566a962',
        '1700000000',
        '{"userId":"u1"}',
      ),
    ).toBe('41294c53497c1d18871786b2d5c3ec091e6b357638e7104d826de50af8813242');
  });

  it('vector 2: another secret, same message', () => {
    expect(
      computeWebhookSignature(
        SECRET_2,
        '3b241101-e2bb-4255-8caf-4136c566a962',
        '1700000000',
        '{"userId":"u1"}',
      ),
    ).toBe('89de6c4652b33d864427b3091771ed8b9266a99b3bf915b126eb4655a2dce09f');
  });

  it('vector 3: body hashed as UTF-8 bytes (non-ASCII user id)', () => {
    expect(
      computeWebhookSignature(
        SECRET_1,
        '9b2f0f6e-8d3a-4f6b-9c1e-2a7d5e4c1b30',
        '1700000123',
        '{"userId":"4b8f-é"}',
      ),
    ).toBe('d9a2c8cec34058ebb100f8b454ba46b1214cf777000d9aab00dda91205d5a3ac');
  });

  it('accepts the timestamp as a number (same string on the wire)', () => {
    expect(
      computeWebhookSignature(
        SECRET_1,
        '3b241101-e2bb-4255-8caf-4136c566a962',
        1700000000,
        '{"userId":"u1"}',
      ),
    ).toBe('41294c53497c1d18871786b2d5c3ec091e6b357638e7104d826de50af8813242');
  });
});

describe('buildWebhookSignatureHeader', () => {
  const id = '3b241101-e2bb-4255-8caf-4136c566a962';
  const body = '{"userId":"u1"}';

  it('one v1= entry for one secret', () => {
    expect(buildWebhookSignatureHeader([SECRET_1], id, 1700000000, body)).toBe(
      'v1=41294c53497c1d18871786b2d5c3ec091e6b357638e7104d826de50af8813242',
    );
  });

  it('vector 4: two comma-separated v1= entries, current secret first (overlap)', () => {
    expect(
      buildWebhookSignatureHeader([SECRET_1, SECRET_2], id, 1700000000, body),
    ).toBe(
      'v1=41294c53497c1d18871786b2d5c3ec091e6b357638e7104d826de50af8813242,' +
        'v1=89de6c4652b33d864427b3091771ed8b9266a99b3bf915b126eb4655a2dce09f',
    );
  });

  it('returns null without a secret (nothing to sign with)', () => {
    expect(buildWebhookSignatureHeader([], id, 1700000000, body)).toBeNull();
  });
});
