import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
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
    const useCase = new LogoutUseCase(
      refreshTokenRepository,
      clientRepository,
      webhookNotifier,
    );
    return {
      useCase,
      refreshTokenRepository,
      clientRepository,
      webhookNotifier,
    };
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

    expect(await refreshTokenRepository.findAllForUser('user-1')).toHaveLength(
      0,
    );
  });

  it('notifies logout webhooks for clients with active tokens', async () => {
    const {
      useCase,
      refreshTokenRepository,
      clientRepository,
      webhookNotifier,
    } = createUseCase();
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
      {
        url: 'https://budget.example.com/internal/session-revoked',
        payload: { userId: 'user-1' },
      },
    ]);
  });

  it('does not fail when a webhook notification throws', async () => {
    const {
      useCase,
      refreshTokenRepository,
      clientRepository,
      webhookNotifier,
    } = createUseCase();
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

  // The logout response must never wait for client apps (CLAUDE.md: never block logout on webhooks).
  it('notifies every client in parallel without waiting for them', async () => {
    const {
      useCase,
      refreshTokenRepository,
      clientRepository,
      webhookNotifier,
    } = createUseCase();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    for (const id of ['slow', 'broken']) {
      await clientRepository.save(
        Client.create({
          id,
          name: id,
          clientSecretHash: 'hash',
          redirectUris: [`https://${id}.example.com/auth/callback`],
          logoutWebhookUrl: `https://${id}.example.com/internal/session-revoked`,
          createdAt: new Date(),
        }),
      );
      await refreshTokenRepository.save(
        RefreshToken.issue({
          id: randomUUID(),
          tokenHash: `hash-${id}`,
          userId: 'user-1',
          clientId: id,
          createdAt: new Date(),
        }),
      );
    }
    const notified: string[] = [];
    jest.spyOn(webhookNotifier, 'notify').mockImplementation((url: string) => {
      notified.push(url);
      return url.includes('slow')
        ? new Promise(() => undefined)
        : Promise.reject(new Error('ECONNREFUSED'));
    });

    await expect(useCase.execute('user-1')).resolves.toBeUndefined();
    expect(await refreshTokenRepository.findAllForUser('user-1')).toHaveLength(
      0,
    );
    await new Promise(setImmediate);

    expect(notified.sort()).toEqual([
      'https://broken.example.com/internal/session-revoked',
      'https://slow.example.com/internal/session-revoked',
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).toContain('broken');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('user-1');
    warn.mockRestore();
  }, 1000);
});
