import type { MediaType } from "../enums";

export interface Media {
  id: string;
  recommendationId: string;
  mediaType: MediaType;
  storageProvider: "telegram" | "r2";
  telegramFileId: string | null;
  telegramFileUniqueId: string | null;
  r2Key: string | null;
  isPublic: boolean;
  uploadedBy: string | null;
  createdAt: Date;
}
