import { randomBytes } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthorizationCode } from '../../domain/auth/authorization-code';
import { AuthorizationCodeRepository } from '../../domain/auth/authorization-code.repository';
import { ClientRepository } from '../../domain/client/client.repository';
import { ClientAccessRepository } from '../../domain/client-access/client-access.repository';
import { hashToken } from '../../domain/shared/hash';

export interface AuthorizeInput {
  userId: string;
  clientId: string;
  redirectUri: string;
}

@Injectable()
export class AuthorizeUseCase {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly clientAccessRepository: ClientAccessRepository,
    private readonly authorizationCodeRepository: AuthorizationCodeRepository,
  ) {}

  async execute(input: AuthorizeInput): Promise<string> {
    const client = await this.clientRepository.findById(input.clientId);
    if (!client) {
      throw new NotFoundException(`Unknown client: ${input.clientId}`);
    }
    if (!client.hasRedirectUri(input.redirectUri)) {
      throw new BadRequestException('Invalid redirect_uri');
    }

    const hasAccess = await this.clientAccessRepository.exists(input.userId, input.clientId);
    if (!hasAccess) {
      throw new ForbiddenException(`User is not authorized for client ${input.clientId}`);
    }

    const rawCode = randomBytes(32).toString('hex');
    const code = AuthorizationCode.issue({
      codeHash: hashToken(rawCode),
      userId: input.userId,
      clientId: input.clientId,
      redirectUri: input.redirectUri,
    });
    await this.authorizationCodeRepository.save(code);

    return rawCode;
  }
}
