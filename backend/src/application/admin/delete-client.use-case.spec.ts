import { Client } from '../../domain/client/client';
import { InMemoryClientRepository } from '../test/in-memory-repositories';
import { DeleteClientUseCase } from './delete-client.use-case';

describe('DeleteClientUseCase', () => {
  it('deletes an existing client', async () => {
    const clientRepository = new InMemoryClientRepository();
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
    const useCase = new DeleteClientUseCase(clientRepository);

    await useCase.execute('budget');

    expect(await clientRepository.findById('budget')).toBeNull();
  });

  it('rejects an unknown client', async () => {
    const useCase = new DeleteClientUseCase(new InMemoryClientRepository());
    await expect(useCase.execute('unknown')).rejects.toThrow('Client unknown not found');
  });
});
