import { ApiProperty } from '@nestjs/swagger';
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

export function toClientDto(client: Client): ClientDto {
  return {
    id: client.id,
    name: client.name,
    redirectUris: client.redirectUris,
    logoutWebhookUrl: client.logoutWebhookUrl,
    createdAt: client.createdAt,
  };
}
