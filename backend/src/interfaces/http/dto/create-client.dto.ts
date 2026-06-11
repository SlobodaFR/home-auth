import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateClientDto {
  @ApiProperty({ description: 'Lowercase alphanumeric identifier with hyphens', example: 'budget' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]*$/, { message: 'id must be lowercase alphanumeric with hyphens' })
  id!: string;

  @ApiProperty({ description: 'Human-readable application name' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ description: 'Allowed OAuth2 redirect URIs', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  redirectUris!: string[];

  @ApiPropertyOptional({ description: 'URL notified on logout', nullable: true })
  @IsOptional()
  @IsString()
  logoutWebhookUrl?: string | null;
}
