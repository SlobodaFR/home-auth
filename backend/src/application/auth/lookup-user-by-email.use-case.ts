import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ClientRepository } from '../../domain/client/client.repository';
import { verifySecret } from '../../domain/shared/hash';
import { UserRepository } from '../../domain/user/user.repository';
import {
  GetUserInfoUseCase,
  UserInfo,
} from '../profile/get-user-info.use-case';

export interface LookupUserByEmailInput {
  clientId: string;
  clientSecret: string;
  email: string;
}

export type UserLookupResult = Omit<
  UserInfo,
  'countryCode' | 'locale' | 'isAdmin'
>;

/**
 * Resolves a User by email for a trusted OAuth2 client, service-to-service —
 * no end-user session involved. Same client-credential check as the /token
 * endpoint (ExchangeCodeUseCase), so a leaked client_secret grants nothing
 * beyond what it already grants for the OAuth flow.
 */
@Injectable()
export class LookupUserByEmailUseCase {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly userRepository: UserRepository,
    private readonly getUserInfoUseCase: GetUserInfoUseCase,
  ) {}

  async execute(
    input: LookupUserByEmailInput,
  ): Promise<UserLookupResult | undefined> {
    const client = await this.clientRepository.findById(input.clientId);
    if (!client || !verifySecret(input.clientSecret, client.clientSecretHash)) {
      throw new UnauthorizedException('Invalid client credentials');
    }

    const user = await this.userRepository.findByEmail(input.email);
    if (!user) {
      return undefined;
    }

    const { id, email, name, avatarUrl } =
      await this.getUserInfoUseCase.execute(user.id);
    return { id, email, name, avatarUrl };
  }
}
