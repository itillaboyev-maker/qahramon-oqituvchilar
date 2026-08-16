/**
 * PUBLIC catalog DTOs (Viloyat → Tuman → Ustoz → Profil).
 *
 * Deliberately separate from TeacherPublishQueueItem / TeacherPublishDetail
 * (moderator-facing types) — those carry internal/moderation fields that must
 * never reach an unauthenticated public bot user. These DTOs are an explicit
 * allow-list: only fields listed here can ever be sent to the public bot.
 *
 * NEVER add: recommenderPhone, teacherPhone, userId, moderator/internal
 * fields, moderation metadata, internal storage metadata, or any other
 * nominator's data.
 */

export interface PublicRegionSummary {
  id: string;
  name: string;
  publishedTeacherCount: number;
}

export interface PublicDistrictSummary {
  id: string;
  name: string;
  publishedTeacherCount: number;
}

export interface PublicTeacherListItem {
  id: string;
  fullName: string;
  school: string | null;
  subject: string | null;
}

export interface PublicTeacherListPage {
  items: PublicTeacherListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PublicMediaItem {
  id: string;
  mediaType: "photo" | "video" | "document";
  objectKey: string | null;
  storageProvider: string | null;
  telegramFileId: string | null;
}

export interface PublicTeacherProfile {
  id: string;
  fullName: string;
  regionName: string | null;
  districtName: string | null;
  school: string | null;
  subject: string | null;
  position: string | null;
  yearsOfExperience: number | null;
  biography: string | null;
  achievements: string | null;
  educationalPhilosophy: string | null;
  impactStories: string | null;
  recommendationReasons: string | null;
  additionalInfo: string | null;
  media: PublicMediaItem[];
}
