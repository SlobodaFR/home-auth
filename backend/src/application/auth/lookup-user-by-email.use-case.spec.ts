import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '../../domain/client/client';
import * as hash from '../../domain/shared/hash';
import { hashSecret } from '../../domain/shared/hash';
import { User } from '../../domain/user/user';
import { GetUserInfoUseCase } from '../profile/get-user-info.use-case';
import {
  InMemoryClientRepository,
  InMemoryUserRepository,
} from '../test/in-memory-repositories';
import { LookupUserByEmailUseCase } from './lookup-user-by-email.use-case';

const RAW_SECRET = 's3cret';

describe('LookupUserByEmailUseCase', () => {
  function createUseCase() {
    const clientRepository = new InMemoryClientRepository();
    const userRepository = new InMemoryUserRepository();
    const config = new ConfigService({
      AUTH_BASE_URL: 'https://auth.example.com',
    });
    const getUserInfoUseCase = new GetUserInfoUseCase(userRepository, config);
    const useCase = new LookupUserByEmailUseCase(
      clientRepository,
      userRepository,
      getUserInfoUseCase,
    );
    return { useCase, clientRepository, userRepository };
  }

  async function seedClient(clientRepository: InMemoryClientRepository) {
    await clientRepository.save(
      Client.create({
        id: 'home-ai',
        name: 'Home AI',
        clientSecretHash: await hashSecret(RAW_SECRET),
        redirectUris: ['https://ai.example.com/auth/callback'],
        logoutWebhookUrl: null,
        createdAt: new Date(),
      }),
    );
  }

  it('rejects an unknown client id', async () => {
    const { useCase } = createUseCase();

    await expect(
      useCase.execute({
        clientId: 'ghost',
        clientSecret: 'anything',
        email: 'alice@example.com',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a wrong client secret', async () => {
    const { useCase, clientRepository } = createUseCase();
    await seedClient(clientRepository);

    await expect(
      useCase.execute({
        clientId: 'home-ai',
        clientSecret: 'wrong',
        email: 'alice@example.com',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('returns undefined for an email with no matching User', async () => {
    const { useCase, clientRepository } = createUseCase();
    await seedClient(clientRepository);

    const result = await useCase.execute({
      clientId: 'home-ai',
      clientSecret: RAW_SECRET,
      email: 'nobody@example.com',
    });

    expect(result).toBeUndefined();
  });

  it('returns the User profile for a known email, once client credentials verify', async () => {
    const { useCase, clientRepository, userRepository } = createUseCase();
    await seedClient(clientRepository);
    await userRepository.save(
      User.create({
        id: 'user-1',
        email: 'alice@example.com',
        name: 'Alice',
        avatarKey: null,
        isAdmin: false,
        createdAt: new Date(),
      }),
    );

    const result = await useCase.execute({
      clientId: 'home-ai',
      clientSecret: RAW_SECRET,
      email: 'Alice@Example.com',
    });

    expect(result).toEqual({
      id: 'user-1',
      email: 'alice@example.com',
      name: 'Alice',
      avatarUrl: 'https://auth.example.com/avatars/user-1',
    });
  });
  // Same cost as a known client: response time must not reveal which client ids exist.
  it('runs the secret check even when the client is unknown', async () => {
    const deps = createUseCase();
    const verify = vi.spyOn(hash, 'verifySecret');

    await expect(
      deps.useCase.execute({
        clientId: 'unknown',
        clientSecret: RAW_SECRET,
        email: 'alice@example.com',
      }),
    ).rejects.toThrow('Invalid client credentials');
    expect(verify).toHaveBeenCalledWith(RAW_SECRET, null);
    verify.mockRestore();
  });
});
