import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User } from '../../domain/user/user';
import { UserRepository } from '../../domain/user/user.repository';

export interface UpdateUserInput {
  name?: string;
  isAdmin?: boolean;
}

@Injectable()
export class UpdateUserUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  /**
   * @param actorId the admin making the change. An admin cannot remove their own admin role: since
   * only admins can demote, at least one admin remains under sequential use (two admins demoting
   * each other concurrently is not prevented).
   */
  async execute(
    actorId: string,
    userId: string,
    input: UpdateUserInput,
  ): Promise<User> {
    if (actorId === userId && input.isAdmin === false) {
      throw new ForbiddenException('You cannot remove your own admin role');
    }

    let user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    if (input.name !== undefined) {
      user = user.rename(input.name);
    }
    if (input.isAdmin !== undefined) {
      user = user.withAdmin(input.isAdmin);
    }

    await this.userRepository.save(user);
    return user;
  }
}
