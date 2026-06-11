import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AuthorizeQueryDto {
  @ApiProperty({ description: 'OAuth2 client identifier' })
  @IsString()
  @IsNotEmpty()
  client_id!: string;

  @ApiProperty({ description: 'Redirect URI registered for the client' })
  @IsString()
  @IsNotEmpty()
  redirect_uri!: string;
}
