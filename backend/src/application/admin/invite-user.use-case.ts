import { randomUUID } from 'crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { User } from '../../domain/user/user';
import { UserRepository } from '../../domain/user/user.repository';

export interface InviteUserInput {
  email: string;
  name: string;
}

@Injectable()
export class InviteUserUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(input: InviteUserInput): Promise<User> {
    const email = input.email.trim().toLowerCase();
    if (await this.userRepository.findByEmail(email)) {
      throw new ConflictException(`User ${email} already exists`);
    }

    const user = User.create({
      id: randomUUID(),
      email,
      name: input.name,
      avatarKey: null,
      isAdmin: false,
      createdAt: new Date(),
    });
    await this.userRepository.save(user);
    return user;
  }
}
