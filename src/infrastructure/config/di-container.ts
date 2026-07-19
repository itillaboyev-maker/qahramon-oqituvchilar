import { createDb, type Database } from "../db/client";
import { TeacherRepository } from "../db/repositories/teacher.repository";
import { RecommendationRepository } from "../db/repositories/recommendation.repository";
import { UserRepository } from "../db/repositories/user.repository";
import { MediaRepository } from "../db/repositories/media.repository";
import { DuplicateCandidateRepository } from "../db/repositories/duplicate-candidate.repository";
import { AuditLogRepository } from "../db/repositories/audit-log.repository";
import { PostgresSessionStore } from "../session/postgres-session-store";
import { TelegramClient } from "../telegram/client/telegram-client";
import { FindOrCreateTeacherUseCase } from "../../application/use-cases/teacher/find-or-create-teacher.use-case";
import { GetTeacherAggregateUseCase } from "../../application/use-cases/teacher/get-teacher-aggregate.use-case";
import { MergeTeachersUseCase } from "../../application/use-cases/teacher/merge-teachers.use-case";
import { SearchTeachersUseCase } from "../../application/use-cases/teacher/search-teachers.use-case";
import { SubmitNominationUseCase } from "../../application/use-cases/recommendation/submit-nomination.use-case";
import { ModerateRecommendationUseCase } from "../../application/use-cases/recommendation/moderate-recommendation.use-case";
import { ListPendingRecommendationsUseCase } from "../../application/use-cases/recommendation/list-pending-recommendations.use-case";
import { RegisterUserUseCase } from "../../application/use-cases/user/register-user.use-case";
import type { Env } from "./env";

/**
 * Simple factory-based DI (no framework) — intentionally lightweight for MVP speed
 * while still keeping every use case dependent only on ports, never on Drizzle or
 * grammy directly. Swapping any adapter later means editing only this file.
 */
export function buildContainer(env: Env) {
  const db: Database = createDb(env.DATABASE_URL);

  const teacherRepo = new TeacherRepository(db);
  const recommendationRepo = new RecommendationRepository(db);
  const userRepo = new UserRepository(db);
  const mediaRepo = new MediaRepository(db);
  const duplicateCandidateRepo = new DuplicateCandidateRepository(db);
  const auditLogRepo = new AuditLogRepository(db);
  const sessionStore = new PostgresSessionStore(db);

  const publicTelegramClient = new TelegramClient(env.PUBLIC_BOT_TOKEN);
  const adminTelegramClient = new TelegramClient(env.ADMIN_BOT_TOKEN);

  const findOrCreateTeacher = new FindOrCreateTeacherUseCase(teacherRepo, duplicateCandidateRepo);
  const getTeacherAggregate = new GetTeacherAggregateUseCase(teacherRepo, recommendationRepo, mediaRepo);
  const mergeTeachers = new MergeTeachersUseCase(duplicateCandidateRepo, teacherRepo, recommendationRepo, userRepo, auditLogRepo);
  const searchTeachers = new SearchTeachersUseCase(teacherRepo, userRepo);
  const submitNomination = new SubmitNominationUseCase(findOrCreateTeacher, recommendationRepo, mediaRepo);
  const moderateRecommendation = new ModerateRecommendationUseCase(recommendationRepo, userRepo, teacherRepo, auditLogRepo);
  const listPendingRecommendations = new ListPendingRecommendationsUseCase(recommendationRepo);
  const registerUser = new RegisterUserUseCase(userRepo);

  return {
    db,
    repos: { teacherRepo, recommendationRepo, userRepo, mediaRepo, duplicateCandidateRepo, auditLogRepo },
    sessionStore,
    telegramClients: { publicTelegramClient, adminTelegramClient },
    useCases: {
      findOrCreateTeacher,
      getTeacherAggregate,
      mergeTeachers,
      searchTeachers,
      submitNomination,
      moderateRecommendation,
      listPendingRecommendations,
      registerUser,
    },
  };
}

export type Container = ReturnType<typeof buildContainer>;
