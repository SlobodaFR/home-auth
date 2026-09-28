import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LookupUserByEmailDto {
  @ApiProperty({ description: 'OAuth2 client identifier' })
  @IsString()
  @IsNotEmpty()
  client_id!: string;

  @ApiProperty({ description: 'OAuth2 client secret' })
  @IsString()
  @IsNotEmpty()
  client_secret!: string;

  @ApiProperty({ description: 'Email address to resolve to a User' })
  @IsEmail()
  email!: string;
}
