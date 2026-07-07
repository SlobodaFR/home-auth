import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRepository } from '../../domain/user/user.repository';

export interface UpdateProfilePayload {
  name?: string;
  countryCode?: string | null;
  locale?: string | null;
}

@Injectable()
export class UpdateProfileUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(userId: string, payload: UpdateProfilePayload): Promise<void> {
    let user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    if (payload.name !== undefined) {
      user = user.rename(payload.name);
    }
    if ('countryCode' in payload) {
      user = user.withCountryCode(payload.countryCode ?? null);
    }
    if ('locale' in payload) {
      user = user.withLocale(payload.locale ?? null);
    }
    await this.userRepository.save(user);
  }
}
