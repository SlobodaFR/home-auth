import { ApiProperty } from '@nestjs/swagger';

export class AuthCallbackResponseDto {
  @ApiProperty({ description: 'Identifier of the authenticated user' })
  userId!: string;
}
