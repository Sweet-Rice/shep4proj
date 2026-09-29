import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

export type Db = PostgresJsDatabase<typeof schema>;

export function createDb(url: string): { db: Db; close(): Promise<void> } {
  const client = postgres(url);
  const db = drizzle(client, { schema });
  return {
    db,
    async close() {
      await client.end();
    },
  };
}
