import type { UserRole, Locale } from "../enums";

export interface User {
  id: string;
  telegramId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: UserRole;
  locale: Locale;
  isBanned: boolean;
  createdAt: Date;
  updatedAt: Date;
}
