import { ApiProperty } from '@nestjs/swagger';
import { ClientDto } from './client.presenter';

export class CreateClientResponseDto {
  @ApiProperty({ type: ClientDto })
  client!: ClientDto;

  @ApiProperty({ description: 'Plaintext client secret (shown only once)' })
  clientSecret!: string;
}
