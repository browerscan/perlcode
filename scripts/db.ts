import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

export const sql = postgres(databaseUrl, {
  max: Number(process.env.DATABASE_MAX_CONNECTIONS || "10"),
});

export function toPgvector(embedding: number[]): string {
  const values = embedding.map((n) => (Number.isFinite(n) ? n : 0));
  return `[${values.join(",")}]`;
}
