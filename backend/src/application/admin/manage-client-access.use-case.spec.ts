import { Client } from '../../domain/client/client';
import { User } from '../../domain/user/user';
import {
  InMemoryClientAccessRepository,
  InMemoryClientRepository,
  InMemoryUserRepository,
} from '../test/in-memory-repositories';
import {
  GrantClientAccessUseCase,
  ListClientAccessUseCase,
  RevokeClientAccessUseCase,
} from './manage-client-access.use-case';

describe('manage client access use-cases', () => {
  function createDeps() {
    const clientRepository = new InMemoryClientRepository();
    const userRepository = new InMemoryUserRepository();
    const clientAccessRepository = new InMemoryClientAccessRepository();
    return { clientRepository, userRepository, clientAccessRepository };
  }

  async function seed(deps: ReturnType<typeof createDeps>) {
    await deps.clientRepository.save(
      Client.create({
        id: 'budget',
        name: 'Foyer Budget',
        clientSecretHash: 'hash',
        redirectUris: ['https://budget.example.com/auth/callback'],
        logoutWebhookUrl: null,
        createdAt: new Date(),
      }),
    );
    await deps.userRepository.save(
      User.create({
        id: 'user-1',
        email: 'alice@example.com',
        name: 'Alice',
        avatarKey: null,
        isAdmin: false,
        createdAt: new Date(),
      }),
    );
  }

  it('grants, lists, and revokes client access', async () => {
    const deps = createDeps();
    await seed(deps);
    const grant = new GrantClientAccessUseCase(deps.clientRepository, deps.userRepository, deps.clientAccessRepository);
    const list = new ListClientAccessUseCase(deps.clientRepository, deps.clientAccessRepository);
    const revoke = new RevokeClientAccessUseCase(deps.clientAccessRepository);

    await grant.execute('budget', 'user-1');
    expect(await list.execute('budget')).toEqual(['user-1']);

    await revoke.execute('budget', 'user-1');
    expect(await list.execute('budget')).toEqual([]);
  });

  it('rejects granting access for an unknown client', async () => {
    const deps = createDeps();
    await seed(deps);
    const grant = new GrantClientAccessUseCase(deps.clientRepository, deps.userRepository, deps.clientAccessRepository);

    await expect(grant.execute('unknown', 'user-1')).rejects.toThrow('Client unknown not found');
  });

  it('rejects granting access for an unknown user', async () => {
    const deps = createDeps();
    await seed(deps);
    const grant = new GrantClientAccessUseCase(deps.clientRepository, deps.userRepository, deps.clientAccessRepository);

    await expect(grant.execute('budget', 'unknown')).rejects.toThrow('User unknown not found');
  });

  it('rejects listing access for an unknown client', async () => {
    const deps = createDeps();
    const list = new ListClientAccessUseCase(deps.clientRepository, deps.clientAccessRepository);

    await expect(list.execute('unknown')).rejects.toThrow('Client unknown not found');
  });
});
