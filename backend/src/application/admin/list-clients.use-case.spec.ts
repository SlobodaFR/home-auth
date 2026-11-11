import { Client } from '../../domain/client/client';
import { ClientAccess } from '../../domain/client-access/client-access';
import {
  InMemoryClientAccessRepository,
  InMemoryClientRepository,
} from '../test/in-memory-repositories';
import { ListClientsUseCase } from './list-clients.use-case';

function client(id: string): Client {
  return Client.create({
    id,
    name: `App ${id}`,
    clientSecretHash: 'hash',
    redirectUris: [`https://${id}.example.com/auth/callback`],
    logoutWebhookUrl: null,
    createdAt: new Date(),
  });
}

describe('ListClientsUseCase', () => {
  it('returns every client, in repository order, with its allowed user count', async () => {
    const clientRepository = new InMemoryClientRepository();
    const clientAccessRepository = new InMemoryClientAccessRepository();
    await clientRepository.save(client('budget'));
    await clientRepository.save(client('trainer'));
    await clientRepository.save(client('qrcode'));
    for (const userId of ['user-1', 'user-2']) {
      await clientAccessRepository.grant(
        ClientAccess.create({ userId, clientId: 'budget' }),
      );
    }
    await clientAccessRepository.grant(
      ClientAccess.create({ userId: 'user-1', clientId: 'trainer' }),
    );
    // Grant left on a client id that no longer exists: must not show up anywhere.
    await clientAccessRepository.grant(
      ClientAccess.create({ userId: 'user-1', clientId: 'gone' }),
    );

    const summaries = await new ListClientsUseCase(
      clientRepository,
      clientAccessRepository,
    ).execute();

    expect(
      summaries.map(({ client: { id }, allowedUserCount }) => [
        id,
        allowedUserCount,
      ]),
    ).toEqual([
      ['budget', 2],
      ['trainer', 1],
      ['qrcode', 0],
    ]);
  });
});
