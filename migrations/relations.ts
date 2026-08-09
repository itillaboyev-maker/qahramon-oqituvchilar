import { relations } from "drizzle-orm/relations";
import { regions, districts, teachers, recommendations, users, auditLogs, botSessions, generatedContent, duplicateCandidates, media } from "./schema";

export const districtsRelations = relations(districts, ({one, many}) => ({
	region: one(regions, {
		fields: [districts.regionId],
		references: [regions.id]
	}),
	teachers: many(teachers),
}));

export const regionsRelations = relations(regions, ({many}) => ({
	districts: many(districts),
	teachers: many(teachers),
}));

export const teachersRelations = relations(teachers, ({one, many}) => ({
	region: one(regions, {
		fields: [teachers.regionId],
		references: [regions.id]
	}),
	district: one(districts, {
		fields: [teachers.districtId],
		references: [districts.id]
	}),
	teacher: one(teachers, {
		fields: [teachers.mergedIntoTeacherId],
		references: [teachers.id],
		relationName: "teachers_mergedIntoTeacherId_teachers_id"
	}),
	teachers: many(teachers, {
		relationName: "teachers_mergedIntoTeacherId_teachers_id"
	}),
	recommendations: many(recommendations),
	generatedContents: many(generatedContent),
	duplicateCandidates_teacherIdA: many(duplicateCandidates, {
		relationName: "duplicateCandidates_teacherIdA_teachers_id"
	}),
	duplicateCandidates_teacherIdB: many(duplicateCandidates, {
		relationName: "duplicateCandidates_teacherIdB_teachers_id"
	}),
}));

export const recommendationsRelations = relations(recommendations, ({one, many}) => ({
	teacher: one(teachers, {
		fields: [recommendations.teacherId],
		references: [teachers.id]
	}),
	user_submittedByUserId: one(users, {
		fields: [recommendations.submittedByUserId],
		references: [users.id],
		relationName: "recommendations_submittedByUserId_users_id"
	}),
	user_moderatedBy: one(users, {
		fields: [recommendations.moderatedBy],
		references: [users.id],
		relationName: "recommendations_moderatedBy_users_id"
	}),
	media: many(media),
}));

export const usersRelations = relations(users, ({many}) => ({
	recommendations_submittedByUserId: many(recommendations, {
		relationName: "recommendations_submittedByUserId_users_id"
	}),
	recommendations_moderatedBy: many(recommendations, {
		relationName: "recommendations_moderatedBy_users_id"
	}),
	auditLogs: many(auditLogs),
	botSessions: many(botSessions),
	generatedContents: many(generatedContent),
	duplicateCandidates: many(duplicateCandidates),
	media: many(media),
}));

export const auditLogsRelations = relations(auditLogs, ({one}) => ({
	user: one(users, {
		fields: [auditLogs.actorUserId],
		references: [users.id]
	}),
}));

export const botSessionsRelations = relations(botSessions, ({one}) => ({
	user: one(users, {
		fields: [botSessions.userId],
		references: [users.id]
	}),
}));

export const generatedContentRelations = relations(generatedContent, ({one}) => ({
	teacher: one(teachers, {
		fields: [generatedContent.teacherId],
		references: [teachers.id]
	}),
	user: one(users, {
		fields: [generatedContent.createdBy],
		references: [users.id]
	}),
}));

export const duplicateCandidatesRelations = relations(duplicateCandidates, ({one}) => ({
	teacher_teacherIdA: one(teachers, {
		fields: [duplicateCandidates.teacherIdA],
		references: [teachers.id],
		relationName: "duplicateCandidates_teacherIdA_teachers_id"
	}),
	teacher_teacherIdB: one(teachers, {
		fields: [duplicateCandidates.teacherIdB],
		references: [teachers.id],
		relationName: "duplicateCandidates_teacherIdB_teachers_id"
	}),
	user: one(users, {
		fields: [duplicateCandidates.reviewedBy],
		references: [users.id]
	}),
}));

export const mediaRelations = relations(media, ({one}) => ({
	user: one(users, {
		fields: [media.uploadedBy],
		references: [users.id]
	}),
	recommendation: one(recommendations, {
		fields: [media.recommendationId],
		references: [recommendations.id]
	}),
}));