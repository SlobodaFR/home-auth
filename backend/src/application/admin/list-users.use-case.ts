import { Injectable } from '@nestjs/common';
import { User } from '../../domain/user/user';
import { UserRepository } from '../../domain/user/user.repository';

@Injectable()
export class ListUsersUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(): Promise<User[]> {
    return this.userRepository.findAll();
  }
}
