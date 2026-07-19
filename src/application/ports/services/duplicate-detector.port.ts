// Future extension point (deferred per decision #2: pgvector + embeddings come later).
// MVP Identity Resolution uses TeacherIdentityResolver (domain service) combining
// transliteration + Levenshtein/Jaro-Winkler name similarity with district/school/
// subject/experience attributes — see find-or-create-teacher.use-case.ts. This port
// is where an embedding-based matcher would plug in as an additional signal later.
export interface DuplicateDetectorPort {
  findSimilarTeachers(fullName: string, districtId?: string | null): Promise<string[]>;
}
