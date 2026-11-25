import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RpLogoutDto {
  @ApiProperty({ description: 'OAuth2 client identifier' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  client_id!: string;

  @ApiProperty({
    description:
      "Return URL: its origin must be that of one of the client's redirect URIs",
    maxLength: 2048,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  post_logout_redirect_uri!: string;

  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  state?: string;
}

export class RpLogoutResponseDto {
  @ApiProperty({ description: 'Server-built URL to navigate to' })
  redirect_to!: string;
}
