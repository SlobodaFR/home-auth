import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUserInfoUseCase, UserInfo } from '../../../application/profile/get-user-info.use-case';
import { UpdateProfileUseCase } from '../../../application/profile/update-profile.use-case';
import { UploadAvatarUseCase } from '../../../application/profile/upload-avatar.use-case';
import { CurrentUser } from '../decorators/current-user.decorator';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { SessionAuthGuard, SessionUser } from '../guards/session-auth.guard';
import { ProfileDto } from '../presenters/user-info.dto';

@ApiTags('Profile')
@ApiCookieAuth('auth_session')
@Controller('profile')
@UseGuards(SessionAuthGuard)
export class ProfileController {
  constructor(
    private readonly getUserInfo: GetUserInfoUseCase,
    private readonly updateProfile: UpdateProfileUseCase,
    private readonly uploadAvatar: UploadAvatarUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the current user profile' })
  @ApiResponse({ status: 200, type: ProfileDto })
  async me(@CurrentUser() user: SessionUser): Promise<UserInfo & { isAdmin: boolean }> {
    const info = await this.getUserInfo.execute(user.id);
    return { ...info, isAdmin: user.isAdmin };
  }

  @Patch()
  @HttpCode(204)
  @ApiOperation({ summary: 'Update the current user profile' })
  @ApiResponse({ status: 204, description: 'Profile updated' })
  async update(@CurrentUser() user: SessionUser, @Body() dto: UpdateProfileDto): Promise<void> {
    await this.updateProfile.execute(user.id, dto);
  }

  @Post('avatar')
  @HttpCode(204)
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiOperation({ summary: 'Upload a new avatar image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { avatar: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 204, description: 'Avatar updated' })
  async avatar(@CurrentUser() user: SessionUser, @UploadedFile() file?: Express.Multer.File): Promise<void> {
    if (!file) {
      throw new BadRequestException('Avatar file is required');
    }
    await this.uploadAvatar.execute(user.id, { contentType: file.mimetype, body: file.buffer });
  }
}
