import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';
import { PKCE_VALUE_PATTERN } from './authorize-query.dto';

export class TokenRequestDto {
  @ApiProperty({ enum: ['authorization_code', 'refresh_token'] })
  @IsIn(['authorization_code', 'refresh_token'])
  grant_type!: 'authorization_code' | 'refresh_token';

  @ApiProperty({ description: 'OAuth2 client identifier' })
  @IsString()
  @IsNotEmpty()
  client_id!: string;

  @ApiProperty({ description: 'OAuth2 client secret' })
  @IsString()
  @IsNotEmpty()
  client_secret!: string;

  @ApiPropertyOptional({
    description:
      'Authorization code (required for grant_type=authorization_code)',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({
    description:
      'Redirect URI used in the authorize step (required for authorization_code)',
  })
  @IsOptional()
  @IsString()
  redirect_uri?: string;

  @ApiPropertyOptional({
    description:
      'PKCE verifier (required when /authorize received a code_challenge)',
  })
  // Not @IsOptional: it would let null through to the domain.
  @ValidateIf((dto: TokenRequestDto) => dto.code_verifier !== undefined)
  @IsString()
  @Matches(PKCE_VALUE_PATTERN)
  code_verifier?: string;

  @ApiPropertyOptional({
    description: 'Refresh token (required for grant_type=refresh_token)',
  })
  @IsOptional()
  @IsString()
  refresh_token?: string;
}
