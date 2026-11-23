import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InviteUserUseCase } from '../../../application/admin/invite-user.use-case';
import { ListUsersUseCase } from '../../../application/admin/list-users.use-case';
import { RevokeUserSessionsUseCase } from '../../../application/admin/revoke-user-sessions.use-case';
import { UpdateUserUseCase } from '../../../application/admin/update-user.use-case';
import { CurrentUser } from '../decorators/current-user.decorator';
import { InviteUserDto } from '../dto/invite-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { AdminGuard } from '../guards/admin.guard';
import { SameOriginGuard } from '../guards/same-origin.guard';
import { SessionAuthGuard, SessionUser } from '../guards/session-auth.guard';
import { toUserDto, UserDto } from '../presenters/user.presenter';
import { SESSION_SECURITY_SCHEME } from '../session-cookie';

@ApiTags('Admin - Users')
@ApiCookieAuth(SESSION_SECURITY_SCHEME)
@Controller('admin/users')
// SameOriginGuard first: a cross-site form must be refused before any session work.
@UseGuards(SameOriginGuard, SessionAuthGuard, AdminGuard)
export class AdminUsersController {
  constructor(
    private readonly listUsersUseCase: ListUsersUseCase,
    private readonly inviteUserUseCase: InviteUserUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly revokeUserSessionsUseCase: RevokeUserSessionsUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List users' })
  @ApiResponse({ status: 200, type: [UserDto] })
  async list(): Promise<UserDto[]> {
    return (await this.listUsersUseCase.execute()).map(toUserDto);
  }

  @Post()
  @ApiOperation({ summary: 'Invite a new user by email' })
  @ApiResponse({ status: 201, type: UserDto })
  async invite(@Body() dto: InviteUserDto): Promise<UserDto> {
    return toUserDto(await this.inviteUserUseCase.execute(dto));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user (name and/or admin status)' })
  @ApiResponse({ status: 200, type: UserDto })
  @ApiResponse({
    status: 403,
    description: 'An admin cannot remove their own admin role',
  })
  async update(
    @CurrentUser() actor: SessionUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserDto> {
    return toUserDto(await this.updateUserUseCase.execute(actor.id, id, dto));
  }

  @Post(':id/revoke-sessions')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Sign a user out of every device',
    description:
      "Invalidates all the user's SSO sessions, revokes their refresh tokens and notifies the client apps (same as the user's own logout). Access tokens already issued live until their expiry (15 min).",
  })
  @ApiResponse({ status: 204, description: 'Sessions revoked' })
  @ApiResponse({ status: 404, description: 'Unknown user' })
  async revokeSessions(@Param('id') id: string): Promise<void> {
    await this.revokeUserSessionsUseCase.execute(id);
  }
}
