export interface CreateAuditLogInput {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
}

/** Records every moderator/editor action (Stage 9) — was defined in the schema since
 * the original migration but never actually written to until now. */
export interface AuditLogRepositoryPort {
  record(input: CreateAuditLogInput): Promise<void>;
}
