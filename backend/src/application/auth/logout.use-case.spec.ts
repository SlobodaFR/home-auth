import { randomUUID } from 'crypto';
import { RefreshToken } from '../../domain/auth/refresh-token';
import { Client } from '../../domain/client/client';
import {
  FakeWebhookNotifier,
  InMemoryClientRepository,
  InMemoryRefreshTokenRepository,
} from '../test/in-memory-repositories';
import { LogoutUseCase } from './logout.use-case';

describe('LogoutUseCase', () => {
  function createUseCase() {
    const refreshTokenRepository = new InMemoryRefreshTokenRepository();
    const clientRepository = new InMemoryClientRepository();
    const webhookNotifier = new FakeWebhookNotifier();
    const useCase = new LogoutUseCase(refreshTokenRepository, clientRepository, webhookNotifier);
    return { useCase, refreshTokenRepository, clientRepository, webhookNotifier };
  }

  it('revokes all refresh tokens for the user', async () => {
    const { useCase, refreshTokenRepository } = createUseCase();
    await refreshTokenRepository.save(
      RefreshToken.issue({
        id: randomUUID(),
        tokenHash: 'hash-1',
        userId: 'user-1',
        clientId: 'budget',
        createdAt: new Date(),
      }),
    );
    await refreshTokenRepository.save(
      RefreshToken.issue({
        id: randomUUID(),
        tokenHash: 'hash-2',
        userId: 'user-1',
        clientId: 'other',
        createdAt: new Date(),
      }),
    );

    await useCase.execute('user-1');

    expect(await refreshTokenRepository.findAllForUser('user-1')).toHaveLength(0);
  });

  it('notifies logout webhooks for clients with active tokens', async () => {
    const { useCase, refreshTokenRepository, clientRepository, webhookNotifier } = createUseCase();
    await clientRepository.save(
      Client.create({
        id: 'budget',
        name: 'Foyer Budget',
        clientSecretHash: 'hash',
        redirectUris: ['https://budget.example.com/auth/callback'],
        logoutWebhookUrl: 'https://budget.example.com/internal/session-revoked',
        createdAt: new Date(),
      }),
    );
    await clientRepository.save(
      Client.create({
        id: 'other',
        name: 'Other',
        clientSecretHash: 'hash',
        redirectUris: ['https://other.example.com/auth/callback'],
        logoutWebhookUrl: null,
        createdAt: new Date(),
      }),
    );
    await refreshTokenRepository.save(
      RefreshToken.issue({
        id: randomUUID(),
        tokenHash: 'hash-1',
        userId: 'user-1',
        clientId: 'budget',
        createdAt: new Date(),
      }),
    );
    await refreshTokenRepository.save(
      RefreshToken.issue({
        id: randomUUID(),
        tokenHash: 'hash-2',
        userId: 'user-1',
        clientId: 'other',
        createdAt: new Date(),
      }),
    );

    await useCase.execute('user-1');

    expect(webhookNotifier.calls).toEqual([
      { url: 'https://budget.example.com/internal/session-revoked', payload: { userId: 'user-1' } },
    ]);
  });

  it('does not fail when a webhook notification throws', async () => {
    const { useCase, refreshTokenRepository, clientRepository, webhookNotifier } = createUseCase();
    await clientRepository.save(
      Client.create({
        id: 'budget',
        name: 'Foyer Budget',
        clientSecretHash: 'hash',
        redirectUris: ['https://budget.example.com/auth/callback'],
        logoutWebhookUrl: 'https://budget.example.com/internal/session-revoked',
        createdAt: new Date(),
      }),
    );
    await refreshTokenRepository.save(
      RefreshToken.issue({
        id: randomUUID(),
        tokenHash: 'hash-1',
        userId: 'user-1',
        clientId: 'budget',
        createdAt: new Date(),
      }),
    );
    jest.spyOn(webhookNotifier, 'notify').mockRejectedValue(new Error('boom'));

    await expect(useCase.execute('user-1')).resolves.toBeUndefined();
  });
});
