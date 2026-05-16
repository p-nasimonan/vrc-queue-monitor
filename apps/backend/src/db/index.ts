import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const host = process.env.DB_HOST ?? "localhost";
const port = parseInt(process.env.DB_PORT ?? "5432");
const user = process.env.DB_USER ?? "postgres";
const password = process.env.DB_PASSWORD ?? "postgres";
const database = process.env.DB_NAME ?? "vrc_monitor";

export const sql = postgres({
  host,
  port,
  user,
  password,
  database,
  // Ensure timestamps from DB are treated as UTC
  transform: { undefined: null },
});

export const db = drizzle(sql, { schema });
