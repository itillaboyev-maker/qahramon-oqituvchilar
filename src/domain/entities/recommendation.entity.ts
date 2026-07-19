import type { Relationship, SubmissionType, RecommendationStatus } from "../enums";

export interface Recommendation {
  id: string;
  teacherId: string;
  submittedByUserId: string | null;
  recommenderName: string | null;
  recommenderPhone: string | null; // always optional — never required in the UX
  teacherPhone: string | null; // optional public-flow teacher phone, stored as a recommendation contact when provided
  relationship: Relationship | null;
  submissionType: SubmissionType;
  recommendationText: string | null;
  achievementsText: string | null;
  teachingMethodsText: string | null;
  studentImpactText: string | null;
  evidenceText: string | null;
  additionalInfo: string | null;
  status: RecommendationStatus;
  moderationNotes: string | null;
  moderatedBy: string | null;
  moderatedAt: Date | null;
  consentGiven: boolean;
  consentGivenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
