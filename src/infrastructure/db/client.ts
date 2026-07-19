import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(databaseUrl: string) {
  // prepare: false is required on Cloudflare Workers (no persistent TCP across requests
  // in the same way as Node) — pairs with Supabase's pooled connection string (port 6543).
  const client = postgres(databaseUrl, { prepare: false });
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;
