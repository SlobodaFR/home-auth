import { Client } from '../../domain/client/client';
import { ClientAccess } from '../../domain/client-access/client-access';
import { hashToken } from '../../domain/shared/hash';
import {
  InMemoryAuthorizationCodeRepository,
  InMemoryClientAccessRepository,
  InMemoryClientRepository,
} from '../test/in-memory-repositories';
import { AuthorizeUseCase } from './authorize.use-case';

const REDIRECT_URI = 'https://budget.example.com/auth/callback';

describe('AuthorizeUseCase', () => {
  function createUseCase() {
    const clientRepository = new InMemoryClientRepository();
    const clientAccessRepository = new InMemoryClientAccessRepository();
    const authorizationCodeRepository = new InMemoryAuthorizationCodeRepository();
    const useCase = new AuthorizeUseCase(clientRepository, clientAccessRepository, authorizationCodeRepository);
    return { useCase, clientRepository, clientAccessRepository, authorizationCodeRepository };
  }

  async function seedClient(clientRepository: InMemoryClientRepository) {
    await clientRepository.save(
      Client.create({
        id: 'budget',
        name: 'Foyer Budget',
        clientSecretHash: 'hash',
        redirectUris: [REDIRECT_URI],
        logoutWebhookUrl: null,
        createdAt: new Date(),
      }),
    );
  }

  it('issues an authorization code for an authorized user', async () => {
    const { useCase, clientRepository, clientAccessRepository, authorizationCodeRepository } = createUseCase();
    await seedClient(clientRepository);
    await clientAccessRepository.grant(ClientAccess.create({ userId: 'user-1', clientId: 'budget' }));

    const code = await useCase.execute({ userId: 'user-1', clientId: 'budget', redirectUri: REDIRECT_URI });

    expect(code).toHaveLength(64);
    const stored = await authorizationCodeRepository.findByCodeHash(hashToken(code));
    expect(stored?.userId).toBe('user-1');
    expect(stored?.clientId).toBe('budget');
    expect(stored?.redirectUri).toBe(REDIRECT_URI);
  });

  it('rejects an unknown client', async () => {
    const { useCase } = createUseCase();
    await expect(useCase.execute({ userId: 'user-1', clientId: 'unknown', redirectUri: REDIRECT_URI })).rejects.toThrow(
      'Unknown client: unknown',
    );
  });

  it('rejects a redirect_uri not registered for the client', async () => {
    const { useCase, clientRepository, clientAccessRepository } = createUseCase();
    await seedClient(clientRepository);
    await clientAccessRepository.grant(ClientAccess.create({ userId: 'user-1', clientId: 'budget' }));

    await expect(
      useCase.execute({ userId: 'user-1', clientId: 'budget', redirectUri: 'https://evil.example.com' }),
    ).rejects.toThrow('Invalid redirect_uri');
  });

  it('rejects a user without ClientAccess', async () => {
    const { useCase, clientRepository } = createUseCase();
    await seedClient(clientRepository);

    await expect(useCase.execute({ userId: 'user-1', clientId: 'budget', redirectUri: REDIRECT_URI })).rejects.toThrow(
      'User is not authorized for client budget',
    );
  });
});
