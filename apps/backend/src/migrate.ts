import { sql } from "./db/index";

type ColumnMigration = [table: string, column: string, ddl: string];

const COLUMN_MIGRATIONS: ColumnMigration[] = [
  ["instances", "world_thumbnail_url", "ALTER TABLE instances ADD COLUMN world_thumbnail_url TEXT"],
  ["instances", "world_image_url",     "ALTER TABLE instances ADD COLUMN world_image_url TEXT"],
  ["instances", "instance_type",       "ALTER TABLE instances ADD COLUMN instance_type TEXT"],
  ["instances", "region",              "ALTER TABLE instances ADD COLUMN region TEXT"],
  ["instances", "display_name",        "ALTER TABLE instances ADD COLUMN display_name TEXT"],
  ["metrics",   "pc_users",            "ALTER TABLE metrics ADD COLUMN pc_users SMALLINT NOT NULL DEFAULT 0"],
  ["metrics",   "n_users",             "ALTER TABLE metrics ADD COLUMN n_users SMALLINT NOT NULL DEFAULT 0"],
  ["metrics",   "queue_enabled",       "ALTER TABLE metrics ADD COLUMN queue_enabled BOOLEAN NOT NULL DEFAULT FALSE"],
];

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
  `;
  return rows.length > 0;
}

async function columnHasDefault(table: string, column: string): Promise<boolean> {
  const rows = await sql<{ column_default: string | null }[]>`
    SELECT column_default FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
  `;
  return rows.length > 0 && rows[0].column_default != null;
}

export async function runMigrations(): Promise<void> {
  let applied = 0;

  for (const [table, column, ddl] of COLUMN_MIGRATIONS) {
    if (!(await columnExists(table, column))) {
      await sql.unsafe(ddl);
      applied++;
    }
  }

  if (!(await columnHasDefault("metrics", "current_users"))) {
    await sql`ALTER TABLE metrics ALTER COLUMN current_users SET DEFAULT 0`;
    applied++;
  }

  if (applied > 0) {
    console.log(`[migrate] Applied ${applied} migration(s)`);
  } else {
    console.log("[migrate] Already up to date");
  }
}
