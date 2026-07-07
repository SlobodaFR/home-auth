import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO31661Alpha2, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'New display name' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ description: 'ISO 3166-1 alpha-2 country code (e.g. FR)', nullable: true })
  @IsOptional()
  @IsISO31661Alpha2()
  countryCode?: string | null;

  @ApiPropertyOptional({ description: 'BCP 47 locale (e.g. fr-FR or fr)', nullable: true })
  @IsOptional()
  @Matches(/^[a-z]{2,3}(-[A-Z]{2})?$/, { message: 'locale must be a valid BCP 47 tag (e.g. fr or fr-FR)' })
  locale?: string | null;
}
