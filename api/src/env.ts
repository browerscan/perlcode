import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGINS: z.string().default(""),
  DATABASE_URL: z.string().url(),
  DATABASE_MAX_CONNECTIONS: z.coerce.number().int().positive().default(10),
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_MODEL: z.string().default("google/gemini-2.0-flash-exp:free"),
  EXECUTION_CONCURRENCY: z.coerce.number().int().positive().default(2),
  DAILY_EXECUTION_LIMIT: z.coerce.number().int().positive().default(20),
  EXECUTION_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  EXECUTION_IMAGE: z.string().default("perl:5.38-slim"),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(): Env {
  return envSchema.parse(process.env);
}
