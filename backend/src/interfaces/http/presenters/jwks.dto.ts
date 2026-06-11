import { ApiProperty } from '@nestjs/swagger';

export class JsonWebKeyDto {
  [key: string]: unknown;
}

export class JwksDto {
  @ApiProperty({ type: [JsonWebKeyDto] })
  keys!: Record<string, unknown>[];
}
