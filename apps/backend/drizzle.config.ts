import { defineConfig } from "drizzle-kit";

const host = process.env.DB_HOST ?? "localhost";
const port = process.env.DB_PORT ?? "5432";
const user = process.env.DB_USER ?? "postgres";
const password = process.env.DB_PASSWORD ?? "postgres";
const database = process.env.DB_NAME ?? "vrc_monitor";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: `postgresql://${user}:${password}@${host}:${port}/${database}`,
  },
});
