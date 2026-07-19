export type UserRole = "user" | "moderator" | "editor" | "admin";
export type Locale = "uz-latn" | "uz-cyrl" | "ru" | "en";
export type PublishStatus = "draft" | "review" | "published" | "archived";
export type Relationship =
  | "student"
  | "former_student"
  | "parent"
  | "colleague"
  | "school_leader"
  | "community_member"
  | "self";
export type SubmissionType = "self" | "nominated";
export type RecommendationStatus = "new" | "under_review" | "approved" | "rejected" | "published";
export type MediaType = "photo" | "video" | "document";
