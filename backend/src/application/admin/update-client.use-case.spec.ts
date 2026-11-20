import { BadRequestException } from '@nestjs/common';
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

    const updated = await useCase.execute('budget', {
      name: 'Foyer Budget v2',
    });

    expect(updated.name).toBe('Foyer Budget v2');
  });

  it('rejects an unknown client', async () => {
    const useCase = new UpdateClientUseCase(new InMemoryClientRepository());
    await expect(useCase.execute('unknown', { name: 'X' })).rejects.toThrow(
      'Client unknown not found',
    );
  });

  describe('logout webhook URL', () => {
    async function seedClientWithWebhook(
      clientRepository: InMemoryClientRepository,
      logoutWebhookUrl: string,
    ) {
      await clientRepository.save(
        Client.create({
          id: 'budget',
          name: 'Foyer Budget',
          clientSecretHash: 'hash',
          redirectUris: ['https://budget.example.com/auth/callback'],
          logoutWebhookUrl,
          createdAt: new Date(),
        }),
      );
    }

    it('accepts a new https webhook', async () => {
      const clientRepository = new InMemoryClientRepository();
      await seedClient(clientRepository);
      const useCase = new UpdateClientUseCase(clientRepository);

      const updated = await useCase.execute('budget', {
        logoutWebhookUrl: 'https://budget.example.com/hook',
      });

      expect(updated.logoutWebhookUrl).toBe('https://budget.example.com/hook');
    });

    it.each([
      'http://budget.example.com/hook',
      'https://user:pass@budget.example.com/hook',
    ])('rejects the new insecure webhook %s', async (logoutWebhookUrl) => {
      const clientRepository = new InMemoryClientRepository();
      await seedClient(clientRepository);
      const useCase = new UpdateClientUseCase(clientRepository);

      await expect(
        useCase.execute('budget', { logoutWebhookUrl }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(
        (await clientRepository.findById('budget'))?.logoutWebhookUrl,
      ).toBeNull();
    });

    it('rejects changing an http webhook to another http one', async () => {
      const clientRepository = new InMemoryClientRepository();
      await seedClientWithWebhook(clientRepository, 'http://old.local/hook');
      const useCase = new UpdateClientUseCase(clientRepository);

      await expect(
        useCase.execute('budget', {
          logoutWebhookUrl: 'http://new.local/hook',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('keeps an existing http client editable when its webhook is untouched', async () => {
      const clientRepository = new InMemoryClientRepository();
      await seedClientWithWebhook(clientRepository, 'http://old.local/hook');
      const useCase = new UpdateClientUseCase(clientRepository);

      const renamed = await useCase.execute('budget', { name: 'Renamed' });
      expect(renamed.logoutWebhookUrl).toBe('http://old.local/hook');

      // The admin form always resends the whole client: same value = not modified.
      const resent = await useCase.execute('budget', {
        name: 'Renamed again',
        logoutWebhookUrl: 'http://old.local/hook',
      });
      expect(resent.name).toBe('Renamed again');
      expect(resent.logoutWebhookUrl).toBe('http://old.local/hook');
    });

    it('lets an admin clear an http webhook or move it to https', async () => {
      const clientRepository = new InMemoryClientRepository();
      await seedClientWithWebhook(clientRepository, 'http://old.local/hook');
      const useCase = new UpdateClientUseCase(clientRepository);

      const secured = await useCase.execute('budget', {
        logoutWebhookUrl: 'https://old.example.com/hook',
      });
      expect(secured.logoutWebhookUrl).toBe('https://old.example.com/hook');
      const cleared = await useCase.execute('budget', {
        logoutWebhookUrl: null,
      });
      expect(cleared.logoutWebhookUrl).toBeNull();
    });
  });
});
