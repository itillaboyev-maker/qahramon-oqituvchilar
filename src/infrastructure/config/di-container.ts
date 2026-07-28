import type { Env } from "./env";
import { createDb, type Database } from "../db/client";
import { R2MediaStorageService } from "../storage/R2MediaStorageService";

// Repositories
import { TeacherRepository } from "../db/repositories/teacher.repository";
import { RecommendationRepository } from "../db/repositories/recommendation.repository";
import { MediaRepository } from "../db/repositories/media.repository";
import { UserRepository } from "../db/repositories/user.repository";
import { AuditLogRepository } from "../db/repositories/audit-log.repository";
import { DuplicateCandidateRepository } from "../db/repositories/duplicate-candidate.repository";
import { PostgresSessionStore } from "../session/postgres-session-store";

// Use Cases
import { FindOrCreateTeacherUseCase } from "../../application/use-cases/teacher/find-or-create-teacher.use-case";
import { SubmitNominationUseCase } from "../../application/use-cases/recommendation/submit-nomination.use-case";
import { RegisterUserUseCase } from "../../application/use-cases/user/register-user.use-case";
import { ListPendingRecommendationsUseCase } from "../../application/use-cases/recommendation/list-pending-recommendations.use-case";
import { ModerateRecommendationUseCase } from "../../application/use-cases/recommendation/moderate-recommendation.use-case";
import { SearchTeachersUseCase } from "../../application/use-cases/teacher/search-teachers.use-case";
import { MergeTeachersUseCase } from "../../application/use-cases/teacher/merge-teachers.use-case";

export interface Container {
  db: Database;
  sessionStore: PostgresSessionStore;
  r2StorageService: R2MediaStorageService | null;
  repos: {
    teacherRepo: TeacherRepository;
    recommendationRepo: RecommendationRepository;
    mediaRepo: MediaRepository;
    userRepo: UserRepository;
    auditLogRepo: AuditLogRepository;
    duplicateCandidateRepo: DuplicateCandidateRepository;
  };
  useCases: {
    findOrCreateTeacher: FindOrCreateTeacherUseCase;
    submitNomination: SubmitNominationUseCase;
    registerUser: RegisterUserUseCase;
    listPendingRecommendations: ListPendingRecommendationsUseCase;
    moderateRecommendation: ModerateRecommendationUseCase;
    searchTeachers: SearchTeachersUseCase;
    mergeTeachers: MergeTeachersUseCase;
  };
  telegramClients: {
    publicTelegramClient: any;
  };
}

export function buildContainer(env: Env): Container {
  const envRecord = env as unknown as {
    DATABASE_URL: string;
    PUBLIC_BOT_TOKEN: string;
    ADMIN_BOT_TOKEN: string;
    R2_BUCKET?: R2Bucket;
    R2_BUCKET_NAME?: string;
  };

  const db = createDb(envRecord.DATABASE_URL);
  const bucketName = envRecord.R2_BUCKET_NAME || "qahramon-media";
  const r2Bucket = envRecord.R2_BUCKET;

  const r2StorageService = r2Bucket
    ? new R2MediaStorageService(r2Bucket, bucketName)
    : null;

  const sessionStore = new PostgresSessionStore(db);

  // Repositories
  const teacherRepo = new TeacherRepository(db);
  const recommendationRepo = new RecommendationRepository(db);
  const mediaRepo = new MediaRepository(db);
  const userRepo = new UserRepository(db);
  const auditLogRepo = new AuditLogRepository(db);
  const duplicateCandidateRepo = new DuplicateCandidateRepository(db);

  // Use Cases
  const findOrCreateTeacher = new FindOrCreateTeacherUseCase(
    teacherRepo,
    duplicateCandidateRepo,
  );

 const submitNomination = new SubmitNominationUseCase(
  findOrCreateTeacher,
  recommendationRepo,
  mediaRepo,
);

  const registerUser = new RegisterUserUseCase(userRepo);
  const listPendingRecommendations = new ListPendingRecommendationsUseCase(recommendationRepo);

  
  
 const searchTeachers = new SearchTeachersUseCase(
  teacherRepo,
  userRepo,
);

const moderateRecommendation = new ModerateRecommendationUseCase(
  userRepo,
  recommendationRepo,
  teacherRepo,
  auditLogRepo,
);
const mergeTeachers = new MergeTeachersUseCase(
  duplicateCandidateRepo,
  teacherRepo,
  recommendationRepo,
  userRepo,
  auditLogRepo,
);
  const publicTelegramClient = {
    async isChannelMember(telegramUserId: number, channelId: string): Promise<boolean> {
  const res = await fetch(
    `https://api.telegram.org/bot${envRecord.PUBLIC_BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(channelId)}&user_id=${telegramUserId}`,
  );

  const data = (await res.json()) as {
    ok: boolean;
    result?: { status: string };
  };

  if (!data.ok || !data.result) {
    return false;
  }

  return !["left", "kicked"].includes(data.result.status);
},
    async getChatMember(chatId: string | number, userId: number) {
      const res = await fetch(
        `https://api.telegram.org/bot${envRecord.PUBLIC_BOT_TOKEN}/getChatMember?chat_id=${chatId}&user_id=${userId}`,
      );
      const data = (await res.json()) as { ok: boolean; result?: { status: string } };
      return data.ok && data.result ? { status: data.result.status } : { status: "left" };
    },
  };

  return {
    db,
    sessionStore,
    r2StorageService,
    repos: {
      teacherRepo,
      recommendationRepo,
      mediaRepo,
      userRepo,
      auditLogRepo,
      duplicateCandidateRepo,
    },
    useCases: {
      findOrCreateTeacher,
      submitNomination,
      registerUser,
      listPendingRecommendations,
      moderateRecommendation,
      searchTeachers,
      mergeTeachers,
    },
    telegramClients: {
      publicTelegramClient,
    },
  };
}