import type { PublishStatus } from "../enums";

export interface Teacher {
  id: string;
  fullName: string;
  normalizedName: string;
  regionId: string | null;
  districtId: string | null;
  school: string | null;
  subject: string | null;
  position: string | null;
  yearsOfExperience: number | null;
  biography: string | null;
  achievements: string | null;
  educationalPhilosophy: string | null;
  impactStories: string | null;
  publishStatus: PublishStatus;
  mergedIntoTeacherId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewTeacherInput {
  fullName: string;
  normalizedName: string;
  regionId?: string | null;
  districtId?: string | null;
  school?: string | null;
  subject?: string | null;
  position?: string | null;
}
