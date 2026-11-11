import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/** RFC 7636 §4.1/§4.2 alphabet and length for code_verifier and code_challenge. */
export const PKCE_VALUE_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

export class AuthorizeQueryDto {
  @ApiProperty({ description: 'OAuth2 client identifier' })
  @IsString()
  @IsNotEmpty()
  client_id!: string;

  @ApiProperty({ description: 'Redirect URI registered for the client' })
  @IsString()
  @IsNotEmpty()
  redirect_uri!: string;

  @ApiPropertyOptional({
    description:
      'Opaque value echoed back in the success redirect (CSRF protection)',
    maxLength: 512,
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  state?: string;

  @ApiPropertyOptional({
    description: 'PKCE challenge: base64url(sha256(code_verifier))',
  })
  // Required as soon as a method is sent: S256 without a challenge would silently give no PKCE.
  @ValidateIf(
    (dto: AuthorizeQueryDto) =>
      dto.code_challenge !== undefined ||
      dto.code_challenge_method !== undefined,
  )
  @IsDefined()
  @Matches(PKCE_VALUE_PATTERN)
  code_challenge?: string;

  @ApiPropertyOptional({
    enum: ['S256'],
    description: 'PKCE method: only S256 (plain is refused)',
  })
  @ValidateIf(
    (dto: AuthorizeQueryDto) =>
      dto.code_challenge !== undefined ||
      dto.code_challenge_method !== undefined,
  )
  @IsIn(['S256'])
  code_challenge_method?: 'S256';
}
