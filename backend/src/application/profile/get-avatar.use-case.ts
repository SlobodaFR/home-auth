import { Injectable, NotFoundException } from '@nestjs/common';
import { AvatarStorage, StoredAvatar } from '../../domain/shared/avatar-storage';
import { UserRepository } from '../../domain/user/user.repository';

export type AvatarResult = { kind: 'stored'; avatar: StoredAvatar } | { kind: 'fallback'; displayName: string };

@Injectable()
export class GetAvatarUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly avatarStorage: AvatarStorage,
  ) {}

  async execute(userId: string): Promise<AvatarResult> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    if (user.avatarKey) {
      const avatar = await this.avatarStorage.get(user.avatarKey);
      if (avatar) {
        return { kind: 'stored', avatar };
      }
    }

    return { kind: 'fallback', displayName: user.name || user.email };
  }
}
