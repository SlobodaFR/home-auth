import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from '../../domain/user/user';
import { UserRepository } from '../../domain/user/user.repository';

export interface UpdateUserInput {
  name?: string;
  isAdmin?: boolean;
}

@Injectable()
export class UpdateUserUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(userId: string, input: UpdateUserInput): Promise<User> {
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
