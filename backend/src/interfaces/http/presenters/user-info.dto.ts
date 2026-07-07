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

  @ApiProperty({ nullable: true })
  countryCode!: string | null;

  @ApiProperty({ nullable: true })
  locale!: string | null;
}

export class ProfileDto extends UserInfoDto {
  @ApiProperty()
  isAdmin!: boolean;
}
