import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GrantClientAccessDto {
  @ApiProperty({ description: 'Identifier of the user to grant access to' })
  @IsString()
  @IsNotEmpty()
  userId!: string;
}
