import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AuthCallbackDto {
  @ApiProperty({ description: 'Magic link token received by email' })
  @IsString()
  @IsNotEmpty()
  token!: string;
}
