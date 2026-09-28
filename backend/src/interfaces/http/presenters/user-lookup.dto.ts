import { ApiProperty } from '@nestjs/swagger';

export class UserLookupDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  avatarUrl!: string;
}
