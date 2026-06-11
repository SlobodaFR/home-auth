import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateClientDto {
  @ApiPropertyOptional({ description: 'Human-readable application name' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ description: 'Allowed OAuth2 redirect URIs', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  redirectUris?: string[];

  @ApiPropertyOptional({ description: 'URL notified on logout', nullable: true })
  @IsOptional()
  @IsString()
  logoutWebhookUrl?: string | null;
}
