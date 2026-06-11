import { Client } from '../../domain/client/client';
import { InMemoryClientRepository } from '../test/in-memory-repositories';
import { UpdateClientUseCase } from './update-client.use-case';

describe('UpdateClientUseCase', () => {
  async function seedClient(clientRepository: InMemoryClientRepository) {
    await clientRepository.save(
      Client.create({
        id: 'budget',
        name: 'Foyer Budget',
        clientSecretHash: 'hash',
        redirectUris: ['https://budget.example.com/auth/callback'],
        logoutWebhookUrl: null,
        createdAt: new Date(),
      }),
    );
  }

  it('updates client fields', async () => {
    const clientRepository = new InMemoryClientRepository();
    await seedClient(clientRepository);
    const useCase = new UpdateClientUseCase(clientRepository);

    const updated = await useCase.execute('budget', { name: 'Foyer Budget v2' });

    expect(updated.name).toBe('Foyer Budget v2');
  });

  it('rejects an unknown client', async () => {
    const useCase = new UpdateClientUseCase(new InMemoryClientRepository());
    await expect(useCase.execute('unknown', { name: 'X' })).rejects.toThrow('Client unknown not found');
  });
});
