import { Client } from './client';

const baseProps = {
  id: 'budget',
  name: 'Foyer Budget',
  clientSecretHash: 'hash',
  redirectUris: ['https://budget.example.com/auth/callback'],
  logoutWebhookUrl: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
};

describe('Client', () => {
  it('creates a valid client', () => {
    const client = Client.create(baseProps);
    expect(client.id).toBe('budget');
    expect(
      client.hasRedirectUri('https://budget.example.com/auth/callback'),
    ).toBe(true);
    expect(client.hasRedirectUri('https://evil.example.com')).toBe(false);
  });

  it('rejects an invalid client id', () => {
    expect(() => Client.create({ ...baseProps, id: 'Budget App' })).toThrow(
      'Client id must be lowercase alphanumeric with hyphens',
    );
  });

  it('rejects an empty redirect URI list', () => {
    expect(() => Client.create({ ...baseProps, redirectUris: [] })).toThrow(
      'At least one redirect URI is required',
    );
  });

  it('rejects an invalid redirect URI', () => {
    expect(() =>
      Client.create({ ...baseProps, redirectUris: ['not-a-url'] }),
    ).toThrow('Invalid URL: not-a-url');
  });

  it('rejects an invalid logout webhook URL', () => {
    expect(() =>
      Client.create({ ...baseProps, logoutWebhookUrl: 'not-a-url' }),
    ).toThrow('Invalid URL: not-a-url');
  });

  it('update returns a new Client with merged fields', () => {
    const client = Client.create(baseProps);
    const updated = client.update({ name: 'Foyer Budget v2' });
    expect(updated.name).toBe('Foyer Budget v2');
    expect(client.name).toBe('Foyer Budget');
  });

  it('withClientSecretHash returns a new Client with the new hash', () => {
    const client = Client.create(baseProps);
    const updated = client.withClientSecretHash('new-hash');
    expect(updated.clientSecretHash).toBe('new-hash');
    expect(client.clientSecretHash).toBe('hash');
  });

  describe('webhook secrets', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const HOUR = 3_600_000;

    it('has no secret by default', () => {
      const client = Client.create(baseProps);
      expect(client.hasWebhookSecret).toBe(false);
      expect(client.activeWebhookSecrets(now)).toEqual([]);
    });

    it('the first regeneration sets the secret and nothing to overlap', () => {
      const client = Client.create(baseProps).regenerateWebhookSecret(
        's1',
        now,
      );
      expect(client.hasWebhookSecret).toBe(true);
      expect(client.activeWebhookSecrets(now)).toEqual(['s1']);
      expect(client.webhookSecretPrevious).toBeNull();
      expect(client.webhookSecretPreviousExpiresAt).toBeNull();
    });

    it('a regeneration keeps the old secret valid for 24 h', () => {
      const client = Client.create(baseProps)
        .regenerateWebhookSecret('s1', now)
        .regenerateWebhookSecret('s2', now);

      expect(client.webhookSecret).toBe('s2');
      expect(client.webhookSecretPrevious).toBe('s1');
      expect(client.webhookSecretPreviousExpiresAt).toEqual(
        new Date(now.getTime() + 24 * HOUR),
      );
      expect(client.activeWebhookSecrets(now)).toEqual(['s2', 's1']);
      expect(
        client.activeWebhookSecrets(new Date(now.getTime() + 24 * HOUR - 1)),
      ).toEqual(['s2', 's1']);
    });

    it('the previous secret stops being used once expired', () => {
      const client = Client.create(baseProps)
        .regenerateWebhookSecret('s1', now)
        .regenerateWebhookSecret('s2', now);

      expect(
        client.activeWebhookSecrets(new Date(now.getTime() + 24 * HOUR)),
      ).toEqual(['s2']);
    });

    it('regenerating again replaces the previous one (only two secrets ever)', () => {
      const later = new Date(now.getTime() + HOUR);
      const client = Client.create(baseProps)
        .regenerateWebhookSecret('s1', now)
        .regenerateWebhookSecret('s2', now)
        .regenerateWebhookSecret('s3', later);

      expect(client.activeWebhookSecrets(later)).toEqual(['s3', 's2']);
    });

    it('is immutable and survives update / withClientSecretHash', () => {
      const original = Client.create(baseProps);
      const regenerated = original.regenerateWebhookSecret('s1', now);

      expect(original.hasWebhookSecret).toBe(false);
      expect(regenerated.update({ name: 'X' }).webhookSecret).toBe('s1');
      expect(regenerated.withClientSecretHash('h').webhookSecret).toBe('s1');
    });
  });
});
