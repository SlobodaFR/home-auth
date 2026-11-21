import { ApiProperty } from '@nestjs/swagger';

export class WebhookSecretResponseDto {
  @ApiProperty({
    description:
      'New HMAC secret (64 hex characters), shown only once. The previous secret keeps signing for 24 h.',
  })
  webhookSecret!: string;
}
