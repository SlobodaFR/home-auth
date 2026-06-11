import { verifySecret } from '../../domain/shared/hash';
import { InMemoryClientRepository } from '../test/in-memory-repositories';
import { CreateClientUseCase } from './create-client.use-case';

describe('CreateClientUseCase', () => {
  it('creates a client and returns the secret in clear once', async () => {
    const clientRepository = new InMemoryClientRepository();
    const useCase = new CreateClientUseCase(clientRepository);

    const result = await useCase.execute({
      id: 'budget',
      name: 'Foyer Budget',
      redirectUris: ['https://budget.example.com/auth/callback'],
      logoutWebhookUrl: null,
    });

    expect(result.client.id).toBe('budget');
    expect(verifySecret(result.clientSecret, result.client.clientSecretHash)).toBe(true);
  });

  it('rejects a duplicate client id', async () => {
    const clientRepository = new InMemoryClientRepository();
    const useCase = new CreateClientUseCase(clientRepository);
    await useCase.execute({
      id: 'budget',
      name: 'Foyer Budget',
      redirectUris: ['https://budget.example.com/auth/callback'],
      logoutWebhookUrl: null,
    });

    await expect(
      useCase.execute({
        id: 'budget',
        name: 'Foyer Budget 2',
        redirectUris: ['https://budget.example.com/auth/callback'],
        logoutWebhookUrl: null,
      }),
    ).rejects.toThrow('Client budget already exists');
  });
});
