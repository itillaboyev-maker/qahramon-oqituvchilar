const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function replace(file, oldStr, newStr) {
  const p = path.join(root, file);
  const src = fs.readFileSync(p, 'utf8');
  if (!src.includes(oldStr)) {
    console.error('OLD BLOCK NOT FOUND in', file);
    process.exit(1);
  }
  const out = src.replace(oldStr, newStr);
  fs.writeFileSync(p, out, 'utf8');
  console.log('patched', file);
}

try {
  replace('src/infrastructure/telegram/admin-bot/router.ts',
`  const {\n    userRepo,\n    teacherRepo,\n    duplicateCandidateRepo,\n    mediaRepo,\n    recommendationRepo,\n  } = container.repos;\n\n  const {\n    listPendingRecommendations,\n    moderateRecommendation,\n    mergeTeachers,\n    searchTeachers,\n  \n     publishTeacher,\n    listPublishQueue,\n    getTeacherPublishDetail,\n  } = container.useCases;\n`,
`  const {\n    userRepo,\n    teacherRepo,\n    duplicateCandidateRepo,\n    mediaRepo,\n    recommendationRepo,\n  } = container.repos;\n\n  const {\n    listPendingRecommendations,\n    moderateRecommendation,\n    mergeTeachers,\n    searchTeachers,\n    publishTeacher,\n    listPublishQueue,\n    getTeacherPublishDetail,\n    listPublishedTeachers,\n  } = container.useCases;\n\n  const publishedTeachers = registerPublishedTeachers(\n    listPublishedTeachers,\n    getTeacherPublishDetail,\n    container.repos.mediaRepo,\n    env,\n  );\n`);

  replace('src/infrastructure/telegram/admin-bot/handlers/published-teachers.handler.ts',
`import { InlineKeyboard, type Context } from "grammy";\nimport type { ListPublishedTeachersUseCase } from "../../../../application/use-cases/teacher/list-published-teachers.use-case";\nimport type { GetTeacherPublishDetailUseCase } from "../../../../application/use-cases/teacher/get-teacher-publish-detail.use-case";\nimport { logger } from "../../../logging/logger";\n\nexport function registerPublishedTeachers(\n  listPublishedTeachers: ListPublishedTeachersUseCase,\n  getTeacherPublishDetail: GetTeacherPublishDetailUseCase,\n) {\n`,
`import { InlineKeyboard, InputFile, type Context } from "grammy";\nimport type { ListPublishedTeachersUseCase } from "../../../../application/use-cases/teacher/list-published-teachers.use-case";\nimport type { GetTeacherPublishDetailUseCase } from "../../../../application/use-cases/teacher/get-teacher-publish-detail.use-case";\nimport type { MediaRepositoryPort } from "../../../../application/ports/repositories/media.repository.port";\nimport type { Env } from "../../../config/env";\nimport { logger } from "../../../logging/logger";\n\nexport function registerPublishedTeachers(\n  listPublishedTeachers: ListPublishedTeachersUseCase,\n  getTeacherPublishDetail: GetTeacherPublishDetailUseCase,\n  mediaRepo: MediaRepositoryPort,\n  env: Env,\n) {\n`);

  replace('src/infrastructure/telegram/admin-bot/handlers/published-teachers.handler.ts',
`      const kb = new InlineKeyboard().text("⬅️ Orqaga", `teachers:list:${fromPage}`);\n\n      await safeReply(ctx, lines.join("\\n"), { reply_markup: kb });\n    },\n`,
`      const detailText = lines.join("\\n");\n      const kb = new InlineKeyboard().text("⬅️ Orqaga", `teachers:list:${fromPage}`);\n\n      await safeReply(ctx, detailText, { reply_markup: kb });\n      await sendTeacherMedia(ctx, detail.recommendations.map((item) => item.recommendation.id));\n    },\n\n    async sendTeacherMedia(ctx: Context, recommendationIds: string[]) {\n      const r2Bucket = (env as any).R2_BUCKET;\n      if (!r2Bucket || recommendationIds.length === 0) {\n        return;\n      }\n\n      const mediaItems = await mediaRepo.listByRecommendationIds(recommendationIds);\n      if (mediaItems.length === 0) {\n        return;\n      }\n\n      for (const media of mediaItems) {\n        try {\n          if (!media.objectKey) {\n            continue;\n          }\n\n          const object = await r2Bucket.get(media.objectKey);\n          if (!object) {\n            continue;\n          }\n\n          const bytes = new Uint8Array(await object.arrayBuffer());\n          const filename = media.objectKey.split("/").pop() ?? "media";\n\n          if (media.mediaType === "photo") {\n            await ctx.replyWithPhoto(new InputFile(bytes, filename));\n          } else if (media.mediaType === "video") {\n            await ctx.replyWithVideo(new InputFile(bytes, filename));\n          }\n        } catch (err) {\n          logger.error("published_teachers.media_send_failed", {\n            err: err instanceof Error ? err.message : String(err),\n          });\n        }\n      }\n    },\n`);

  console.log('All patches applied');
} catch(e){console.error(e);process.exit(1);}