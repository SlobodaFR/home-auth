import { Client } from '../../domain/client/client';
import { InMemoryClientRepository } from '../test/in-memory-repositories';
import { RegenerateWebhookSecretUseCase } from './regenerate-webhook-secret.use-case';

describe('RegenerateWebhookSecretUseCase', () => {
  async function setup() {
    const clientRepository = new InMemoryClientRepository();
    await clientRepository.save(
      Client.create({
        id: 'budget',
        name: 'Foyer Budget',
        clientSecretHash: 'hash',
        redirectUris: ['https://budget.example.com/auth/callback'],
        logoutWebhookUrl: 'https://budget.example.com/hook',
        createdAt: new Date(),
      }),
    );
    return {
      clientRepository,
      useCase: new RegenerateWebhookSecretUseCase(clientRepository),
    };
  }

  it('generates 32 random bytes as hex, stores them and returns them once', async () => {
    const { useCase, clientRepository } = await setup();

    const { webhookSecret } = await useCase.execute('budget');

    expect(webhookSecret).toMatch(/^[0-9a-f]{64}$/);
    const stored = await clientRepository.findById('budget');
    expect(stored?.webhookSecret).toBe(webhookSecret);
    expect(stored?.webhookSecretPrevious).toBeNull();
  });

  it('keeps the previous secret for the 24 h overlap on regeneration', async () => {
    const { useCase, clientRepository } = await setup();
    const first = await useCase.execute('budget');
    const before = Date.now();

    const second = await useCase.execute('budget');

    expect(second.webhookSecret).not.toBe(first.webhookSecret);
    const stored = await clientRepository.findById('budget');
    expect(stored?.activeWebhookSecrets(new Date())).toEqual([
      second.webhookSecret,
      first.webhookSecret,
    ]);
    const expiresAt = stored?.webhookSecretPreviousExpiresAt?.getTime() ?? 0;
    expect(expiresAt).toBeGreaterThanOrEqual(before + 24 * 3_600_000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 24 * 3_600_000);
  });

  it('rejects an unknown client', async () => {
    const { useCase } = await setup();

    await expect(useCase.execute('unknown')).rejects.toThrow(
      'Client unknown not found',
    );
  });
});
