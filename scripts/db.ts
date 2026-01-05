import postgres from "postgres";
import { getDbEnv } from "./env";

const env = getDbEnv();
const databaseUrl = env.DATABASE_URL;

export const sql = postgres(databaseUrl, {
  max: env.DATABASE_MAX_CONNECTIONS,
});

export function toPgvector(embedding: number[]): string {
  const values = embedding.map((n) => (Number.isFinite(n) ? n : 0));
  return `[${values.join(",")}]`;
}
