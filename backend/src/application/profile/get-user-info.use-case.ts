import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRepository } from '../../domain/user/user.repository';

export interface UserInfo {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
}

@Injectable()
export class GetUserInfoUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly config: ConfigService,
  ) {}

  async execute(userId: string): Promise<UserInfo> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const authBaseUrl = this.config.get<string>('AUTH_BASE_URL', 'http://localhost:3000').replace(/\/$/, '');

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: `${authBaseUrl}/avatars/${user.id}`,
    };
  }
}
