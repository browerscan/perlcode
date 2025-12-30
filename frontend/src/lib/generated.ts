import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export interface GeneratedQuestion {
  slug: string;
  title: string;
  question: string;
  answer_html: string;
  category: string;
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced" | string;
  created_at: string;
  published_at: string | null;
  is_verified: boolean;
  is_indexable?: boolean;
  code_snippet: string | null;
  code_stdout: string | null;
  code_stderr: string | null;
  code_runtime_ms: number | null;
  perl_version: string | null;
}

export interface GeneratedCategory {
  name: string;
  slug: string;
  total: number;
  verified: number;
  indexable: number;
}

export interface GeneratedMeta {
  generated_at: string;
  total_questions: number;
  verified_questions: number;
  indexable_questions: number;
}

let questionsCache: GeneratedQuestion[] | null = null;
let categoriesCache: GeneratedCategory[] | null = null;
let metaCache: GeneratedMeta | null = null;

async function readJsonFile<T>(relativeToThisFile: string): Promise<T | null> {
  try {
    const url = new URL(relativeToThisFile, import.meta.url);
    const text = await readFile(fileURLToPath(url), "utf8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function loadQuestions(): Promise<GeneratedQuestion[]> {
  if (questionsCache) return questionsCache;
  const data = await readJsonFile<GeneratedQuestion[]>(
    "../generated/questions.json",
  );
  questionsCache = Array.isArray(data) ? data : [];
  return questionsCache;
}

export async function loadCategories(): Promise<GeneratedCategory[]> {
  if (categoriesCache) return categoriesCache;
  const data = await readJsonFile<GeneratedCategory[]>(
    "../generated/categories.json",
  );
  categoriesCache = Array.isArray(data) ? data : [];
  return categoriesCache;
}

export async function loadMeta(): Promise<GeneratedMeta | null> {
  if (metaCache) return metaCache;
  const data = await readJsonFile<GeneratedMeta>("../generated/meta.json");
  metaCache = data ?? null;
  return metaCache;
}

export function isIndexableQuestion(q: GeneratedQuestion): boolean {
  return Boolean(q.is_verified && q.published_at);
}
