import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { GetAvatarUseCase } from '../../../application/profile/get-avatar.use-case';

@ApiTags('Avatars')
@Controller('avatars')
export class AvatarsController {
  constructor(private readonly getAvatar: GetAvatarUseCase) {}

  @Get(':userId')
  @ApiOperation({ summary: "Get a user's avatar image, or redirect to a generated one" })
  @ApiResponse({ status: 200, description: 'Avatar image' })
  @ApiResponse({ status: 302, description: 'Redirect to a generated avatar' })
  async get(@Param('userId') userId: string, @Res() res: Response): Promise<void> {
    const result = await this.getAvatar.execute(userId);

    if (result.kind === 'stored') {
      res.setHeader('Content-Type', result.avatar.contentType);
      res.send(result.avatar.body);
      return;
    }

    res.redirect(302, `https://ui-avatars.com/api/?name=${encodeURIComponent(result.displayName)}`);
  }
}
