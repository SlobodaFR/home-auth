import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AvatarStorage } from '../../domain/shared/avatar-storage';
import {
  detectImageType,
  MAX_AVATAR_BYTES,
} from '../../domain/shared/image-type';
import { UserRepository } from '../../domain/user/user.repository';

@Injectable()
export class UploadAvatarUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly avatarStorage: AvatarStorage,
  ) {}

  async execute(userId: string, body: Buffer): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    // From the content, never the client-declared type: HTML sent as image/png must not pass.
    const contentType = detectImageType(body);
    if (!contentType) {
      throw new BadRequestException('Avatar must be a JPEG, PNG or WebP image');
    }
    if (body.byteLength > MAX_AVATAR_BYTES) {
      throw new BadRequestException('Avatar must not exceed 2MB');
    }

    const avatarKey = await this.avatarStorage.upload(userId, {
      body,
      contentType,
    });
    await this.userRepository.save(user.withAvatarKey(avatarKey));
  }
}
