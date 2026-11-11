import { Client } from '../../domain/client/client';
import { ClientAccess } from '../../domain/client-access/client-access';
import {
  InMemoryClientAccessRepository,
  InMemoryClientRepository,
} from '../test/in-memory-repositories';
import { DeleteClientUseCase } from './delete-client.use-case';

describe('DeleteClientUseCase', () => {
  it('deletes an existing client and the access granted to it', async () => {
    const clientRepository = new InMemoryClientRepository();
    const clientAccessRepository = new InMemoryClientAccessRepository();
    await clientAccessRepository.grant(
      ClientAccess.create({ userId: 'user-1', clientId: 'budget' }),
    );
    await clientAccessRepository.grant(
      ClientAccess.create({ userId: 'user-1', clientId: 'trainer' }),
    );
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
    const useCase = new DeleteClientUseCase(
      clientRepository,
      clientAccessRepository,
    );

    await useCase.execute('budget');

    expect(await clientRepository.findById('budget')).toBeNull();
    // A client re-created with the same id must not inherit the old grants.
    expect(await clientAccessRepository.exists('user-1', 'budget')).toBe(false);
    expect(await clientAccessRepository.exists('user-1', 'trainer')).toBe(true);
  });

  it('rejects an unknown client', async () => {
    const useCase = new DeleteClientUseCase(
      new InMemoryClientRepository(),
      new InMemoryClientAccessRepository(),
    );
    await expect(useCase.execute('unknown')).rejects.toThrow(
      'Client unknown not found',
    );
  });
});
