import type { Database } from "../client";
import { auditLogs } from "../schema";
import type {
  AuditLogRepositoryPort,
  CreateAuditLogInput,
} from "../../../application/ports/repositories/audit-log.repository.port";
import { logger } from "../../logging/logger";

export class AuditLogRepository implements AuditLogRepositoryPort {
  constructor(private readonly db: Database) {}

  async record(input: CreateAuditLogInput): Promise<void> {
    try {
      await this.db.insert(auditLogs).values({
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        beforeState: input.beforeState ?? null,
        afterState: input.afterState ?? null,
      });
    } catch (err) {
      // Audit logging must never break the moderator action it's recording — log the
      // failure loudly instead of throwing, so a DB hiccup on the audit write doesn't
      // block an approve/reject/merge that already succeeded.
      logger.error("audit_log_write_failed", { error: (err as Error).message, ...input });
    }
  }
}
