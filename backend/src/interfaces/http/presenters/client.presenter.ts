import { ApiProperty } from '@nestjs/swagger';
import { ClientSummary } from '../../../application/admin/list-clients.use-case';
import { Client } from '../../../domain/client/client';
import { maskWebhookUrl } from '../../../domain/client/webhook-url';

export class ClientDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: [String] })
  redirectUris!: readonly string[];

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'Webhook URL as shown to admins: query string masked (`?***`). Resend it as-is to keep the stored URL.',
  })
  logoutWebhookUrl!: string | null;

  @ApiProperty({
    description:
      'Whether a webhook signing secret exists. The secret itself is never returned (only once, on regeneration).',
  })
  hasWebhookSecret!: boolean;

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
    logoutWebhookUrl: maskWebhookUrl(client.logoutWebhookUrl),
    hasWebhookSecret: client.hasWebhookSecret,
    createdAt: client.createdAt,
  };
}

export function toClientSummaryDto({
  client,
  allowedUserCount,
}: ClientSummary): ClientSummaryDto {
  return Object.assign(toClientDto(client), { allowedUserCount });
}
