import { Injectable } from '@nestjs/common';
import { SessionService } from '../../domain/auth/session.service';
import { User } from '../../domain/user/user';
import { UserRepository } from '../../domain/user/user.repository';

/**
 * Single place that turns an SSO session cookie into a user, shared by the session guard and
 * /authorize. A session dies as soon as the user's sessionVersion moves past the one it carries
 * (logout, admin revocation).
 */
@Injectable()
export class ResolveSessionUseCase {
  constructor(
    private readonly sessionService: SessionService,
    private readonly userRepository: UserRepository,
  ) {}

  async execute(token: string | undefined): Promise<User | null> {
    if (!token) {
      return null;
    }
    const session = await this.sessionService.verify(token);
    if (!session) {
      return null;
    }
    const user = await this.userRepository.findById(session.userId);
    if (!user) {
      return null;
    }
    // Transitional (PC9 D2): a legacy token without sv is accepted as the current version.
    if (
      session.sessionVersion !== null &&
      session.sessionVersion !== user.sessionVersion
    ) {
      return null;
    }
    return user;
  }
}
