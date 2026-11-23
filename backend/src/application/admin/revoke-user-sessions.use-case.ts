import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRepository } from '../../domain/user/user.repository';
import { LogoutUseCase } from '../auth/logout.use-case';

/**
 * Admin action: signs a user out of every device (compromise, access withdrawal). It is exactly
 * the user's own logout (SSO sessions, refresh tokens, client webhooks), plus a 404 for an
 * unknown user.
 */
@Injectable()
export class RevokeUserSessionsUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly logoutUseCase: LogoutUseCase,
  ) {}

  async execute(userId: string): Promise<void> {
    if (!(await this.userRepository.findById(userId))) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    await this.logoutUseCase.execute(userId);
  }
}
