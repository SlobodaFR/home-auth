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
    expect(client.hasRedirectUri('https://budget.example.com/auth/callback')).toBe(true);
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
    expect(() => Client.create({ ...baseProps, redirectUris: ['not-a-url'] })).toThrow('Invalid URL: not-a-url');
  });

  it('rejects an invalid logout webhook URL', () => {
    expect(() => Client.create({ ...baseProps, logoutWebhookUrl: 'not-a-url' })).toThrow('Invalid URL: not-a-url');
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
});
