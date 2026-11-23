import { buildWebhookRequest } from './webhook-request-builder';

const SECRET_1 =
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const SECRET_2 =
  'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100';
const ID = '3b241101-e2bb-4255-8caf-4136c566a962';
const NOW = new Date(1700000000 * 1000 + 999);

describe('buildWebhookRequest', () => {
  it('body is exactly JSON.stringify({ userId })', () => {
    const { body } = buildWebhookRequest({ userId: 'u1' }, [SECRET_1], NOW, ID);
    expect(body).toBe('{"userId":"u1"}');
    expect(body).toBe(JSON.stringify({ userId: 'u1' }));
  });

  it('sends the contract headers, signing the exact body (vector 1)', () => {
    const { headers } = buildWebhookRequest(
      { userId: 'u1' },
      [SECRET_1],
      NOW,
      ID,
    );

    expect(headers).toEqual({
      'Content-Type': 'application/json',
      'X-Auth-Webhook-Id': ID,
      // unix seconds, truncated
      'X-Auth-Webhook-Timestamp': '1700000000',
      'X-Auth-Webhook-Signature':
        'v1=41294c53497c1d18871786b2d5c3ec091e6b357638e7104d826de50af8813242',
    });
  });

  it('signs with both secrets during the overlap (vector 4)', () => {
    const { headers } = buildWebhookRequest(
      { userId: 'u1' },
      [SECRET_1, SECRET_2],
      NOW,
      ID,
    );

    expect(headers['X-Auth-Webhook-Signature']).toBe(
      'v1=41294c53497c1d18871786b2d5c3ec091e6b357638e7104d826de50af8813242,' +
        'v1=89de6c4652b33d864427b3091771ed8b9266a99b3bf915b126eb4655a2dce09f',
    );
  });

  it('sends no signature header for a client that has no secret yet', () => {
    const { headers } = buildWebhookRequest({ userId: 'u1' }, [], NOW, ID);

    expect(headers['X-Auth-Webhook-Signature']).toBeUndefined();
    expect(headers['X-Auth-Webhook-Id']).toBe(ID);
  });

  it('generates a fresh uuid v4 per delivery by default', () => {
    const a = buildWebhookRequest({ userId: 'u1' }, [SECRET_1]);
    const b = buildWebhookRequest({ userId: 'u1' }, [SECRET_1]);

    expect(a.headers['X-Auth-Webhook-Id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(a.headers['X-Auth-Webhook-Id']).not.toBe(
      b.headers['X-Auth-Webhook-Id'],
    );
  });
});
