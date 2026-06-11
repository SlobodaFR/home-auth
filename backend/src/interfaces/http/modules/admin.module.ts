import { Module } from '@nestjs/common';
import { CreateClientUseCase } from '../../../application/admin/create-client.use-case';
import { DeleteClientUseCase } from '../../../application/admin/delete-client.use-case';
import { InviteUserUseCase } from '../../../application/admin/invite-user.use-case';
import { ListClientsUseCase } from '../../../application/admin/list-clients.use-case';
import { ListUsersUseCase } from '../../../application/admin/list-users.use-case';
import {
  GrantClientAccessUseCase,
  ListClientAccessUseCase,
  RevokeClientAccessUseCase,
} from '../../../application/admin/manage-client-access.use-case';
import { UpdateClientUseCase } from '../../../application/admin/update-client.use-case';
import { UpdateUserUseCase } from '../../../application/admin/update-user.use-case';
import { AdminClientsController } from '../controllers/admin-clients.controller';
import { AdminUsersController } from '../controllers/admin-users.controller';

@Module({
  controllers: [AdminUsersController, AdminClientsController],
  providers: [
    ListUsersUseCase,
    InviteUserUseCase,
    UpdateUserUseCase,
    ListClientsUseCase,
    CreateClientUseCase,
    UpdateClientUseCase,
    DeleteClientUseCase,
    GrantClientAccessUseCase,
    RevokeClientAccessUseCase,
    ListClientAccessUseCase,
  ],
})
export class AdminModule {}
