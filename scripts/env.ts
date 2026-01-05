import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  DATABASE_MAX_CONNECTIONS: z.coerce.number().int().positive().default(10),
  VECTORENGINE_BASE_URL: z
    .string()
    .url()
    .default("https://api.vectorengine.ai"),
  VECTORENGINE_TOKEN: z.string().default(""),
  PERLCODE_EXECUTION_MODE: z.enum(["docker", "local"]).default("docker"),
  PERLCODE_ALLOW_LOCAL_PERL: z
    .string()
    .default("0")
    .transform((value) => value === "1"),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(): Env {
  return envSchema.parse(process.env);
}

export function getDbEnv(): Env & { DATABASE_URL: string } {
  const env = getEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  return env as Env & { DATABASE_URL: string };
}
