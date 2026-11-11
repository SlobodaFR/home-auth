import { ApiProperty } from '@nestjs/swagger';
import { ClientSummary } from '../../../application/admin/list-clients.use-case';
import { Client } from '../../../domain/client/client';

export class ClientDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: [String] })
  redirectUris!: readonly string[];

  @ApiProperty({ nullable: true, type: String })
  logoutWebhookUrl!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class ClientSummaryDto extends ClientDto {
  @ApiProperty({ description: 'Number of users granted access to this client' })
  allowedUserCount!: number;
}

export function toClientDto(client: Client): ClientDto {
  return {
    id: client.id,
    name: client.name,
    redirectUris: client.redirectUris,
    logoutWebhookUrl: client.logoutWebhookUrl,
    createdAt: client.createdAt,
  };
}

export function toClientSummaryDto({
  client,
  allowedUserCount,
}: ClientSummary): ClientSummaryDto {
  return Object.assign(toClientDto(client), { allowedUserCount });
}
