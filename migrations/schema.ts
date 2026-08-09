import { pgTable, unique, check, uuid, varchar, timestamp, index, foreignKey, integer, text, boolean, bigint, jsonb, numeric, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const botType = pgEnum("bot_type", ['public', 'admin'])
export const contentStatus = pgEnum("content_status", ['draft', 'approved', 'published'])
export const contentType = pgEnum("content_type", ['telegram_post', 'instagram_reel_script', 'article', 'documentary_script'])
export const duplicateStatus = pgEnum("duplicate_status", ['pending', 'confirmed_duplicate', 'not_duplicate'])
export const flowType = pgEnum("flow_type", ['none', 'nomination', 'self_submission', 'moderation_review'])
export const locale = pgEnum("locale", ['uz-latn', 'uz-cyrl', 'ru', 'en'])
export const mediaType = pgEnum("media_type", ['photo', 'video', 'document'])
export const publishStatus = pgEnum("publish_status", ['draft', 'review', 'published', 'archived'])
export const recommendationStatus = pgEnum("recommendation_status", ['new', 'under_review', 'approved', 'rejected', 'published'])
export const relationship = pgEnum("relationship", ['student', 'former_student', 'parent', 'colleague', 'school_leader', 'community_member', 'self'])
export const storageProvider = pgEnum("storage_provider", ['telegram', 'r2'])
export const submissionType = pgEnum("submission_type", ['self', 'nominated'])
export const userRole = pgEnum("user_role", ['user', 'moderator', 'editor', 'admin'])


export const regions = pgTable("regions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: varchar({ length: 10 }).notNull(),
	nameUzLatn: varchar("name_uz_latn", { length: 100 }).notNull(),
	nameUzCyrl: varchar("name_uz_cyrl", { length: 100 }),
	nameRu: varchar("name_ru", { length: 100 }),
	nameEn: varchar("name_en", { length: 100 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		regionsCodeUnique: unique("regions_code_unique").on(table.code),
		regionsIdNotNull: check("regions_id_not_null", sql`NOT NULL id`),
		regionsCodeNotNull: check("regions_code_not_null", sql`NOT NULL code`),
		regionsNameUzLatnNotNull: check("regions_name_uz_latn_not_null", sql`NOT NULL name_uz_latn`),
		regionsCreatedAtNotNull: check("regions_created_at_not_null", sql`NOT NULL created_at`),
	}
});

export const districts = pgTable("districts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	regionId: uuid("region_id").notNull(),
	code: varchar({ length: 10 }),
	nameUzLatn: varchar("name_uz_latn", { length: 100 }).notNull(),
	nameUzCyrl: varchar("name_uz_cyrl", { length: 100 }),
	nameRu: varchar("name_ru", { length: 100 }),
	nameEn: varchar("name_en", { length: 100 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		regionIdx: index("districts_region_idx").using("btree", table.regionId.asc().nullsLast().op("uuid_ops")),
		districtsRegionIdRegionsIdFk: foreignKey({
			columns: [table.regionId],
			foreignColumns: [regions.id],
			name: "districts_region_id_regions_id_fk"
		}),
		districtsIdNotNull: check("districts_id_not_null", sql`NOT NULL id`),
		districtsRegionIdNotNull: check("districts_region_id_not_null", sql`NOT NULL region_id`),
		districtsNameUzLatnNotNull: check("districts_name_uz_latn_not_null", sql`NOT NULL name_uz_latn`),
		districtsCreatedAtNotNull: check("districts_created_at_not_null", sql`NOT NULL created_at`),
	}
});

export const teachers = pgTable("teachers", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	fullName: varchar("full_name", { length: 255 }).notNull(),
	normalizedName: varchar("normalized_name", { length: 255 }).notNull(),
	regionId: uuid("region_id"),
	districtId: uuid("district_id"),
	school: varchar({ length: 255 }),
	subject: varchar({ length: 128 }),
	position: varchar({ length: 128 }),
	yearsOfExperience: integer("years_of_experience"),
	biography: text(),
	achievements: text(),
	educationalPhilosophy: text("educational_philosophy"),
	impactStories: text("impact_stories"),
	publishStatus: publishStatus("publish_status").default('draft').notNull(),
	mergedIntoTeacherId: uuid("merged_into_teacher_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		mergedIntoIdx: index("teachers_merged_into_idx").using("btree", table.mergedIntoTeacherId.asc().nullsLast().op("uuid_ops")),
		normalizedNameIdx: index("teachers_normalized_name_idx").using("btree", table.normalizedName.asc().nullsLast().op("text_ops")),
		publishStatusIdx: index("teachers_publish_status_idx").using("btree", table.publishStatus.asc().nullsLast().op("enum_ops")),
		regionDistrictIdx: index("teachers_region_district_idx").using("btree", table.regionId.asc().nullsLast().op("uuid_ops"), table.districtId.asc().nullsLast().op("uuid_ops")),
		teachersRegionIdRegionsIdFk: foreignKey({
			columns: [table.regionId],
			foreignColumns: [regions.id],
			name: "teachers_region_id_regions_id_fk"
		}),
		teachersDistrictIdDistrictsIdFk: foreignKey({
			columns: [table.districtId],
			foreignColumns: [districts.id],
			name: "teachers_district_id_districts_id_fk"
		}),
		teachersMergedIntoTeacherIdTeachersIdFk: foreignKey({
			columns: [table.mergedIntoTeacherId],
			foreignColumns: [table.id],
			name: "teachers_merged_into_teacher_id_teachers_id_fk"
		}),
		teachersIdNotNull: check("teachers_id_not_null", sql`NOT NULL id`),
		teachersFullNameNotNull: check("teachers_full_name_not_null", sql`NOT NULL full_name`),
		teachersNormalizedNameNotNull: check("teachers_normalized_name_not_null", sql`NOT NULL normalized_name`),
		teachersPublishStatusNotNull: check("teachers_publish_status_not_null", sql`NOT NULL publish_status`),
		teachersCreatedAtNotNull: check("teachers_created_at_not_null", sql`NOT NULL created_at`),
		teachersUpdatedAtNotNull: check("teachers_updated_at_not_null", sql`NOT NULL updated_at`),
	}
});

export const recommendations = pgTable("recommendations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	teacherId: uuid("teacher_id").notNull(),
	submittedByUserId: uuid("submitted_by_user_id"),
	recommenderName: varchar("recommender_name", { length: 255 }),
	recommenderPhone: varchar("recommender_phone", { length: 20 }),
	relationship: relationship(),
	submissionType: submissionType("submission_type").notNull(),
	recommendationText: text("recommendation_text"),
	achievementsText: text("achievements_text"),
	teachingMethodsText: text("teaching_methods_text"),
	studentImpactText: text("student_impact_text"),
	evidenceText: text("evidence_text"),
	additionalInfo: text("additional_info"),
	status: recommendationStatus().default('new').notNull(),
	moderationNotes: text("moderation_notes"),
	moderatedBy: uuid("moderated_by"),
	moderatedAt: timestamp("moderated_at", { withTimezone: true, mode: 'string' }),
	consentGiven: boolean("consent_given").default(false).notNull(),
	consentGivenAt: timestamp("consent_given_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		statusIdx: index("recommendations_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
		teacherIdx: index("recommendations_teacher_idx").using("btree", table.teacherId.asc().nullsLast().op("uuid_ops")),
		recommendationsTeacherIdTeachersIdFk: foreignKey({
			columns: [table.teacherId],
			foreignColumns: [teachers.id],
			name: "recommendations_teacher_id_teachers_id_fk"
		}),
		recommendationsSubmittedByUserIdUsersIdFk: foreignKey({
			columns: [table.submittedByUserId],
			foreignColumns: [users.id],
			name: "recommendations_submitted_by_user_id_users_id_fk"
		}),
		recommendationsModeratedByUsersIdFk: foreignKey({
			columns: [table.moderatedBy],
			foreignColumns: [users.id],
			name: "recommendations_moderated_by_users_id_fk"
		}),
		recommendationsIdNotNull: check("recommendations_id_not_null", sql`NOT NULL id`),
		recommendationsTeacherIdNotNull: check("recommendations_teacher_id_not_null", sql`NOT NULL teacher_id`),
		recommendationsSubmissionTypeNotNull: check("recommendations_submission_type_not_null", sql`NOT NULL submission_type`),
		recommendationsStatusNotNull: check("recommendations_status_not_null", sql`NOT NULL status`),
		recommendationsConsentGivenNotNull: check("recommendations_consent_given_not_null", sql`NOT NULL consent_given`),
		recommendationsCreatedAtNotNull: check("recommendations_created_at_not_null", sql`NOT NULL created_at`),
		recommendationsUpdatedAtNotNull: check("recommendations_updated_at_not_null", sql`NOT NULL updated_at`),
	}
});

export const users = pgTable("users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
	username: varchar({ length: 64 }),
	firstName: varchar("first_name", { length: 128 }),
	lastName: varchar("last_name", { length: 128 }),
	phone: varchar({ length: 20 }),
	role: userRole().default('user').notNull(),
	locale: locale().default('uz-latn').notNull(),
	isBanned: boolean("is_banned").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		usersTelegramIdUnique: unique("users_telegram_id_unique").on(table.telegramId),
		usersIdNotNull: check("users_id_not_null", sql`NOT NULL id`),
		usersTelegramIdNotNull: check("users_telegram_id_not_null", sql`NOT NULL telegram_id`),
		usersRoleNotNull: check("users_role_not_null", sql`NOT NULL role`),
		usersLocaleNotNull: check("users_locale_not_null", sql`NOT NULL locale`),
		usersIsBannedNotNull: check("users_is_banned_not_null", sql`NOT NULL is_banned`),
		usersCreatedAtNotNull: check("users_created_at_not_null", sql`NOT NULL created_at`),
		usersUpdatedAtNotNull: check("users_updated_at_not_null", sql`NOT NULL updated_at`),
	}
});

export const auditLogs = pgTable("audit_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	actorUserId: uuid("actor_user_id"),
	action: varchar({ length: 128 }).notNull(),
	entityType: varchar("entity_type", { length: 64 }).notNull(),
	entityId: uuid("entity_id"),
	beforeState: jsonb("before_state"),
	afterState: jsonb("after_state"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		entityIdx: index("audit_logs_entity_idx").using("btree", table.entityType.asc().nullsLast().op("text_ops"), table.entityId.asc().nullsLast().op("text_ops")),
		auditLogsActorUserIdUsersIdFk: foreignKey({
			columns: [table.actorUserId],
			foreignColumns: [users.id],
			name: "audit_logs_actor_user_id_users_id_fk"
		}),
		auditLogsIdNotNull: check("audit_logs_id_not_null", sql`NOT NULL id`),
		auditLogsActionNotNull: check("audit_logs_action_not_null", sql`NOT NULL action`),
		auditLogsEntityTypeNotNull: check("audit_logs_entity_type_not_null", sql`NOT NULL entity_type`),
		auditLogsCreatedAtNotNull: check("audit_logs_created_at_not_null", sql`NOT NULL created_at`),
	}
});

export const botSessions = pgTable("bot_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	botType: botType("bot_type").notNull(),
	flowType: flowType("flow_type").default('none').notNull(),
	currentStep: varchar("current_step", { length: 64 }),
	collectedData: jsonb("collected_data").default({}).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		botSessionsUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "bot_sessions_user_id_users_id_fk"
		}),
		botSessionsIdNotNull: check("bot_sessions_id_not_null", sql`NOT NULL id`),
		botSessionsUserIdNotNull: check("bot_sessions_user_id_not_null", sql`NOT NULL user_id`),
		botSessionsBotTypeNotNull: check("bot_sessions_bot_type_not_null", sql`NOT NULL bot_type`),
		botSessionsFlowTypeNotNull: check("bot_sessions_flow_type_not_null", sql`NOT NULL flow_type`),
		botSessionsCollectedDataNotNull: check("bot_sessions_collected_data_not_null", sql`NOT NULL collected_data`),
		botSessionsCreatedAtNotNull: check("bot_sessions_created_at_not_null", sql`NOT NULL created_at`),
		botSessionsUpdatedAtNotNull: check("bot_sessions_updated_at_not_null", sql`NOT NULL updated_at`),
	}
});

export const generatedContent = pgTable("generated_content", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	teacherId: uuid("teacher_id").notNull(),
	contentType: contentType("content_type").notNull(),
	status: contentStatus().default('draft').notNull(),
	aiModel: varchar("ai_model", { length: 64 }),
	promptVersion: varchar("prompt_version", { length: 32 }),
	contentText: text("content_text"),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		generatedContentTeacherIdTeachersIdFk: foreignKey({
			columns: [table.teacherId],
			foreignColumns: [teachers.id],
			name: "generated_content_teacher_id_teachers_id_fk"
		}),
		generatedContentCreatedByUsersIdFk: foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "generated_content_created_by_users_id_fk"
		}),
		generatedContentIdNotNull: check("generated_content_id_not_null", sql`NOT NULL id`),
		generatedContentTeacherIdNotNull: check("generated_content_teacher_id_not_null", sql`NOT NULL teacher_id`),
		generatedContentContentTypeNotNull: check("generated_content_content_type_not_null", sql`NOT NULL content_type`),
		generatedContentStatusNotNull: check("generated_content_status_not_null", sql`NOT NULL status`),
		generatedContentCreatedAtNotNull: check("generated_content_created_at_not_null", sql`NOT NULL created_at`),
	}
});

export const duplicateCandidates = pgTable("duplicate_candidates", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	teacherIdA: uuid("teacher_id_a").notNull(),
	teacherIdB: uuid("teacher_id_b").notNull(),
	similarityScore: numeric("similarity_score", { precision: 5, scale:  2 }),
	status: duplicateStatus().default('pending').notNull(),
	reviewedBy: uuid("reviewed_by"),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		duplicateCandidatesTeacherIdATeachersIdFk: foreignKey({
			columns: [table.teacherIdA],
			foreignColumns: [teachers.id],
			name: "duplicate_candidates_teacher_id_a_teachers_id_fk"
		}),
		duplicateCandidatesTeacherIdBTeachersIdFk: foreignKey({
			columns: [table.teacherIdB],
			foreignColumns: [teachers.id],
			name: "duplicate_candidates_teacher_id_b_teachers_id_fk"
		}),
		duplicateCandidatesReviewedByUsersIdFk: foreignKey({
			columns: [table.reviewedBy],
			foreignColumns: [users.id],
			name: "duplicate_candidates_reviewed_by_users_id_fk"
		}),
		duplicateCandidatesIdNotNull: check("duplicate_candidates_id_not_null", sql`NOT NULL id`),
		duplicateCandidatesTeacherIdANotNull: check("duplicate_candidates_teacher_id_a_not_null", sql`NOT NULL teacher_id_a`),
		duplicateCandidatesTeacherIdBNotNull: check("duplicate_candidates_teacher_id_b_not_null", sql`NOT NULL teacher_id_b`),
		duplicateCandidatesStatusNotNull: check("duplicate_candidates_status_not_null", sql`NOT NULL status`),
		duplicateCandidatesCreatedAtNotNull: check("duplicate_candidates_created_at_not_null", sql`NOT NULL created_at`),
	}
});

export const media = pgTable("media", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	recommendationId: uuid("recommendation_id").notNull(),
	mediaType: mediaType("media_type").notNull(),
	storageProvider: storageProvider("storage_provider").default('r2').notNull(),
	telegramFileId: varchar("telegram_file_id", { length: 255 }),
	telegramFileUniqueId: varchar("telegram_file_unique_id", { length: 255 }),
	r2Key: varchar("r2_key", { length: 512 }),
	isPublic: boolean("is_public").default(false).notNull(),
	uploadedBy: uuid("uploaded_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	objectKey: varchar("object_key", { length: 512 }),
	bucketName: varchar("bucket_name", { length: 63 }),
	mimeType: varchar("mime_type", { length: 128 }),
	sizeBytes: integer("size_bytes"),
	checksumSha256: varchar("checksum_sha256", { length: 64 }),
}, (table) => {
	return {
		checksumIdx: index("media_checksum_idx").using("btree", table.checksumSha256.asc().nullsLast().op("text_ops")),
		recommendationIdx: index("media_recommendation_idx").using("btree", table.recommendationId.asc().nullsLast().op("uuid_ops")),
		mediaUploadedByUsersIdFk: foreignKey({
			columns: [table.uploadedBy],
			foreignColumns: [users.id],
			name: "media_uploaded_by_users_id_fk"
		}),
		mediaRecommendationIdRecommendationsIdFk: foreignKey({
			columns: [table.recommendationId],
			foreignColumns: [recommendations.id],
			name: "media_recommendation_id_recommendations_id_fk"
		}).onDelete("cascade"),
		mediaIdNotNull: check("media_id_not_null", sql`NOT NULL id`),
		mediaRecommendationIdNotNull: check("media_recommendation_id_not_null", sql`NOT NULL recommendation_id`),
		mediaMediaTypeNotNull: check("media_media_type_not_null", sql`NOT NULL media_type`),
		mediaStorageProviderNotNull: check("media_storage_provider_not_null", sql`NOT NULL storage_provider`),
		mediaIsPublicNotNull: check("media_is_public_not_null", sql`NOT NULL is_public`),
		mediaCreatedAtNotNull: check("media_created_at_not_null", sql`NOT NULL created_at`),
	}
});
