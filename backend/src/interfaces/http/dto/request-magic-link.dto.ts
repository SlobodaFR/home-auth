import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class RequestMagicLinkDto {
  @ApiProperty({ description: 'Email address to send the magic link to' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ description: 'Relative path to return to after sign-in (e.g. /authorize?...)' })
  @IsOptional()
  @IsString()
  redirect?: string;
}
