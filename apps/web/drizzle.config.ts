import { config } from "dotenv";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

config({ path: resolve(__dirname, "../../.env") });
config({ path: resolve(__dirname, ".env") });
config();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres@127.0.0.1:55432/postgres",
  },
  strict: true,
  verbose: true,
});
