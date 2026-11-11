import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AvatarStorage,
  StoredAvatar,
} from '../../domain/shared/avatar-storage';
import { detectImageType } from '../../domain/shared/image-type';
import { UserRepository } from '../../domain/user/user.repository';

export type AvatarResult =
  | { kind: 'stored'; avatar: StoredAvatar }
  | { kind: 'fallback'; displayName: string };

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
      // The detected type wins over the stored one; anything else is never served.
      const contentType = avatar ? detectImageType(avatar.body) : null;
      if (avatar && contentType) {
        return { kind: 'stored', avatar: { body: avatar.body, contentType } };
      }
    }

    return {
      kind: 'fallback',
      displayName: toAvatarName(user.name) || toAvatarName(user.email),
    };
  }
}

/** Generated avatars take the first character of each word: punctuation would end up as an initial. */
function toAvatarName(value: string): string {
  return value
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
