import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRepository } from '../../domain/user/user.repository';

@Injectable()
export class UpdateProfileUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(userId: string, name: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    await this.userRepository.save(user.rename(name));
  }
}
