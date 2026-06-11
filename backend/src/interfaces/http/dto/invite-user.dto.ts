import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class InviteUserDto {
  @ApiProperty({ description: 'Email address of the invited user' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Display name of the invited user' })
  @IsString()
  @IsNotEmpty()
  name!: string;
}
