import {
  Body,
  Controller,
  Get,
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
import { UpdateUserUseCase } from '../../../application/admin/update-user.use-case';
import { CurrentUser } from '../decorators/current-user.decorator';
import { InviteUserDto } from '../dto/invite-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { AdminGuard } from '../guards/admin.guard';
import { SameOriginGuard } from '../guards/same-origin.guard';
import { SessionAuthGuard, SessionUser } from '../guards/session-auth.guard';
import { toUserDto, UserDto } from '../presenters/user.presenter';

@ApiTags('Admin - Users')
@ApiCookieAuth('auth_session')
@Controller('admin/users')
// SameOriginGuard first: a cross-site form must be refused before any session work.
@UseGuards(SameOriginGuard, SessionAuthGuard, AdminGuard)
export class AdminUsersController {
  constructor(
    private readonly listUsersUseCase: ListUsersUseCase,
    private readonly inviteUserUseCase: InviteUserUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
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
}
