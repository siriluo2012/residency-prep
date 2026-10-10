import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

declare global {
  var __rpDb: Db | undefined;
}

function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // Supabase pooler (transaction mode) does not support prepared statements.
  const client = postgres(url, { prepare: false, max: 10 });
  return drizzle(client, { schema });
}

/**
 * Lazily-initialized Drizzle client. Accessing any property creates the connection on first use, so
 * importing this module (e.g. during `next build` page-data collection) never requires DATABASE_URL.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    if (!globalThis.__rpDb) globalThis.__rpDb = createDb();
    const real = globalThis.__rpDb as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

export { schema };
