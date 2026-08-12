import "dotenv/config";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);

try {
  const rows = await sql`
    SELECT enumlabel
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'publish_status'
    ORDER BY e.enumsortorder
  `;

  console.table(rows);
} catch (error) {
  console.error(error);
} finally {
  await sql.end();
}