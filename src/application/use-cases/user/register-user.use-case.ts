import type { UserRepositoryPort } from "../../ports/repositories/user.repository.port";
import type { User } from "../../../domain/entities/user.entity";

export interface RegisterUserInput {
  telegramId: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

/** Called on every /start — upserts so returning users don't create duplicate rows. */
export class RegisterUserUseCase {
  constructor(private readonly userRepo: UserRepositoryPort) {}

  async execute(input: RegisterUserInput): Promise<User> {
    return this.userRepo.upsertByTelegramId(input);
  }
}
