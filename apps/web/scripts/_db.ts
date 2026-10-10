// Drizzle client for CLI scripts (outside Next.js, so no "server-only" guard).
import { config } from "dotenv";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";

config({ path: resolve(__dirname, "../../../.env") });
config({ path: resolve(__dirname, "../.env") });
config();

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
export const client = postgres(url, { prepare: false, max: 4 });
export const db = drizzle(client, { schema });
