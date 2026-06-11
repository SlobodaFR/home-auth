import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AvatarStorage, StoredAvatar } from '../../domain/shared/avatar-storage';
import { UserRepository } from '../../domain/user/user.repository';

const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE_BYTES = 2 * 1024 * 1024;

@Injectable()
export class UploadAvatarUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly avatarStorage: AvatarStorage,
  ) {}

  async execute(userId: string, avatar: StoredAvatar): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    if (!ALLOWED_CONTENT_TYPES.has(avatar.contentType)) {
      throw new BadRequestException('Avatar must be a JPEG, PNG or WebP image');
    }
    if (avatar.body.byteLength > MAX_SIZE_BYTES) {
      throw new BadRequestException('Avatar must not exceed 2MB');
    }

    const avatarKey = await this.avatarStorage.upload(userId, avatar);
    await this.userRepository.save(user.withAvatarKey(avatarKey));
  }
}
