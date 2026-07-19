import type { Context, NextFunction } from "grammy";
import type { UserRepositoryPort } from "../../../../application/ports/repositories/user.repository.port";

/** Only moderator/editor/admin roles can use the admin bot at all — checked on every message. */
export function adminRoleGuard(userRepo: UserRepositoryPort) {
  return async (ctx: Context, next: NextFunction) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await userRepo.findByTelegramId(telegramId);
    if (!user || !(await userRepo.isModeratorOrAbove(user.id))) {
      await ctx.reply("Sizda ushbu botdan foydalanish huquqi yo'q.");
      return;
    }

    return next();
  };
}
