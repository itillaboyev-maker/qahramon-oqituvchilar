/**
 * Structured logger (Stage 9). Cloudflare Workers capture console output directly —
 * `wrangler tail` streams it in real time — so this deliberately doesn't add a new
 * external logging service (no new infrastructure). JSON lines are easy to grep/filter
 * and are a straightforward upgrade path to a log drain later without changing callers.
 */
type LogContext = Record<string, unknown>;

function write(level: "info" | "warn" | "error", message: string, context?: LogContext) {
  const line = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context ?? {}),
  };
  const serialized = JSON.stringify(line);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

export const logger = {
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context),
};
