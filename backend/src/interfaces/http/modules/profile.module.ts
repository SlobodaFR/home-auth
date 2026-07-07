import { Module } from '@nestjs/common';
import { GetAvatarUseCase } from '../../../application/profile/get-avatar.use-case';
import { GetUserInfoUseCase } from '../../../application/profile/get-user-info.use-case';
import { UpdateProfileUseCase } from '../../../application/profile/update-profile.use-case';
import { UploadAvatarUseCase } from '../../../application/profile/upload-avatar.use-case';
import { AvatarsController } from '../controllers/avatars.controller';
import { MeController } from '../controllers/me.controller';
import { ProfileController } from '../controllers/profile.controller';

@Module({
  controllers: [ProfileController, AvatarsController, MeController],
  providers: [GetUserInfoUseCase, UpdateProfileUseCase, UploadAvatarUseCase, GetAvatarUseCase],
})
export class ProfileModule {}
