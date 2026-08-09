import type { User } from "../../../domain/entities/user.entity";

export interface UpsertUserInput {
  telegramId: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface UserRepositoryPort {
  findByTelegramId(telegramId: number): Promise<User | null>;
  upsertByTelegramId(input: UpsertUserInput): Promise<User>;
  isModeratorOrAbove(userId: string): Promise<boolean>;
  /** Editor or admin — the role allowed to make the final publish call on a teacher profile. */
  isEditorOrAbove(userId: string): Promise<boolean>;
}