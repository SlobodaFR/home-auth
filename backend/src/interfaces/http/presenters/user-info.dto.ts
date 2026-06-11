import { ApiProperty } from '@nestjs/swagger';

export class UserInfoDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  avatarUrl!: string;
}

export class ProfileDto extends UserInfoDto {
  @ApiProperty()
  isAdmin!: boolean;
}
