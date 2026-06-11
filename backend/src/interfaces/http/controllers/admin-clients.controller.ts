import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateClientUseCase } from '../../../application/admin/create-client.use-case';
import { DeleteClientUseCase } from '../../../application/admin/delete-client.use-case';
import { ListClientsUseCase } from '../../../application/admin/list-clients.use-case';
import {
  GrantClientAccessUseCase,
  ListClientAccessUseCase,
  RevokeClientAccessUseCase,
} from '../../../application/admin/manage-client-access.use-case';
import { UpdateClientUseCase } from '../../../application/admin/update-client.use-case';
import { CreateClientDto } from '../dto/create-client.dto';
import { GrantClientAccessDto } from '../dto/grant-client-access.dto';
import { UpdateClientDto } from '../dto/update-client.dto';
import { AdminGuard } from '../guards/admin.guard';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { ClientDto, toClientDto } from '../presenters/client.presenter';
import { CreateClientResponseDto } from '../presenters/create-client-response.dto';

@ApiTags('Admin - Clients')
@ApiCookieAuth('auth_session')
@Controller('admin/clients')
@UseGuards(SessionAuthGuard, AdminGuard)
export class AdminClientsController {
  constructor(
    private readonly listClientsUseCase: ListClientsUseCase,
    private readonly createClientUseCase: CreateClientUseCase,
    private readonly updateClientUseCase: UpdateClientUseCase,
    private readonly deleteClientUseCase: DeleteClientUseCase,
    private readonly grantClientAccessUseCase: GrantClientAccessUseCase,
    private readonly revokeClientAccessUseCase: RevokeClientAccessUseCase,
    private readonly listClientAccessUseCase: ListClientAccessUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List OAuth2 clients' })
  @ApiResponse({ status: 200, type: [ClientDto] })
  async list(): Promise<ClientDto[]> {
    return (await this.listClientsUseCase.execute()).map(toClientDto);
  }

  @Post()
  @ApiOperation({ summary: 'Register a new OAuth2 client' })
  @ApiResponse({ status: 201, type: CreateClientResponseDto })
  async create(@Body() dto: CreateClientDto): Promise<{ client: ClientDto; clientSecret: string }> {
    const { client, clientSecret } = await this.createClientUseCase.execute({
      id: dto.id,
      name: dto.name,
      redirectUris: dto.redirectUris,
      logoutWebhookUrl: dto.logoutWebhookUrl ?? null,
    });
    return { client: toClientDto(client), clientSecret };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an OAuth2 client' })
  @ApiResponse({ status: 200, type: ClientDto })
  async update(@Param('id') id: string, @Body() dto: UpdateClientDto): Promise<ClientDto> {
    return toClientDto(await this.updateClientUseCase.execute(id, dto));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an OAuth2 client' })
  @ApiResponse({ status: 204, description: 'Client deleted' })
  async delete(@Param('id') id: string): Promise<void> {
    await this.deleteClientUseCase.execute(id);
  }

  @Get(':id/access')
  @ApiOperation({ summary: 'List user IDs granted access to a client' })
  @ApiResponse({ status: 200, type: [String] })
  async listAccess(@Param('id') id: string): Promise<string[]> {
    return this.listClientAccessUseCase.execute(id);
  }

  @Post(':id/access')
  @HttpCode(204)
  @ApiOperation({ summary: 'Grant a user access to a client' })
  @ApiResponse({ status: 204, description: 'Access granted' })
  async grantAccess(@Param('id') id: string, @Body() dto: GrantClientAccessDto): Promise<void> {
    await this.grantClientAccessUseCase.execute(id, dto.userId);
  }

  @Delete(':id/access/:userId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke a user access to a client' })
  @ApiResponse({ status: 204, description: 'Access revoked' })
  async revokeAccess(@Param('id') id: string, @Param('userId') userId: string): Promise<void> {
    await this.revokeClientAccessUseCase.execute(id, userId);
  }
}
