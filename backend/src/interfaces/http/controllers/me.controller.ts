import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUserInfoUseCase, UserInfo } from '../../../application/profile/get-user-info.use-case';
import { AccessTokenGuard, AccessTokenRequest } from '../guards/access-token.guard';
import { UserInfoDto } from '../presenters/user-info.dto';

@ApiTags('Profile')
@ApiBearerAuth()
@Controller('me')
@UseGuards(AccessTokenGuard)
export class MeController {
  constructor(private readonly getUserInfo: GetUserInfoUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Get the authenticated user profile (Bearer token)' })
  @ApiResponse({ status: 200, type: UserInfoDto })
  async me(@Req() req: AccessTokenRequest): Promise<UserInfo> {
    // req.user is guaranteed non-null by AccessTokenGuard
    const userId = req.user?.sub;
    if (!userId) {
      throw new Error('User not authenticated');
    }
    return this.getUserInfo.execute(userId);
  }
}
