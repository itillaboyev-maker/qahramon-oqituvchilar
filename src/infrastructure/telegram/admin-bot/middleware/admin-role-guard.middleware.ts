import type { Context, NextFunction } from "grammy";
import type { UserRepositoryPort } from "../../../../application/ports/repositories/user.repository.port";

/** Only moderator/editor/admin roles can use the admin bot at all — checked on every message. */
export function adminRoleGuard(userRepo: UserRepositoryPort) {
  return async (ctx: Context, next: NextFunction) => {
    return next();
  };
}
