import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../../domain/user/user';

export class UserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  avatarKey!: string | null;

  @ApiProperty()
  isAdmin!: boolean;

  @ApiProperty()
  createdAt!: Date;
}

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarKey: user.avatarKey,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
  };
}
