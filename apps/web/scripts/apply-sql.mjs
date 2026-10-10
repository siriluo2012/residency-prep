#!/usr/bin/env node
// Apply a raw SQL file to DATABASE_URL (used for RLS policies after drizzle migrations).
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

config({ path: resolve(import.meta.dirname, "../../../.env") });
config({ path: resolve(import.meta.dirname, "../.env") });
config();

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/apply-sql.mjs <file.sql>");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  await sql.unsafe(readFileSync(file, "utf8"));
  console.log(`applied ${file}`);
} finally {
  await sql.end();
}
