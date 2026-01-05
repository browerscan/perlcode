import postgres from "postgres";
import { getEnv } from "../env";

const env = getEnv();
const databaseUrl = env.DATABASE_URL;

export const sql = postgres(databaseUrl, {
  max: env.DATABASE_MAX_CONNECTIONS,
});

export interface QuestionRow {
  id: string;
  slug: string;
  title: string;
  question: string;
  answer_plain?: string;
  rank?: number;
  similarity?: number;
}

export interface ChatSessionRow {
  id: string;
  session_token: string;
  ip_hash: string | null;
  current_page_slug: string | null;
  message_count: number;
  daily_message_count: number;
  execution_count: number;
  daily_execution_count: number;
  last_reset_date: string;
  created_at: string;
  last_active_at: string;
}

export interface ChatHistoryRow {
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

function toPgvector(embedding: number[]): string {
  const values = embedding.map((n) => (Number.isFinite(n) ? n : 0));
  return `[${values.join(",")}]`;
}

export async function getOrCreateSession(
  sessionToken: string,
  ipHash?: string,
): Promise<ChatSessionRow> {
  const existing = await sql<ChatSessionRow[]>`
    SELECT
      id::text,
      session_token,
      ip_hash,
      current_page_slug,
      message_count,
      daily_message_count,
      execution_count,
      daily_execution_count,
      last_reset_date::text,
      created_at::text,
      last_active_at::text
    FROM perlcode.chat_sessions
    WHERE session_token = ${sessionToken}
    LIMIT 1
  `;

  if (existing.length) {
    const session = existing[0];
    const today = new Date().toISOString().slice(0, 10);

    if (session.last_reset_date !== today) {
      const updated = await sql<ChatSessionRow[]>`
        UPDATE perlcode.chat_sessions
        SET
          daily_message_count = 0,
          daily_execution_count = 0,
          last_reset_date = CURRENT_DATE,
          last_active_at = NOW()
        WHERE id = ${session.id}::uuid
        RETURNING
          id::text,
          session_token,
          ip_hash,
          current_page_slug,
          message_count,
          daily_message_count,
          execution_count,
          daily_execution_count,
          last_reset_date::text,
          created_at::text,
          last_active_at::text
      `;
      return updated[0];
    }

    await sql`
      UPDATE perlcode.chat_sessions
      SET last_active_at = NOW()
      WHERE id = ${session.id}::uuid
    `;

    return session;
  }

  const created = await sql<ChatSessionRow[]>`
    INSERT INTO perlcode.chat_sessions (session_token, ip_hash)
    VALUES (${sessionToken}, ${ipHash ?? null})
    RETURNING
      id::text,
      session_token,
      ip_hash,
      current_page_slug,
      message_count,
      daily_message_count,
      execution_count,
      daily_execution_count,
      last_reset_date::text,
      created_at::text,
      last_active_at::text
  `;

  return created[0];
}

export async function searchQuestionsSemantic(
  embedding: number[],
  threshold = 0.7,
  limit = 5,
): Promise<QuestionRow[]> {
  const vec = toPgvector(embedding);

  return await sql<QuestionRow[]>`
    SELECT
      id::text,
      slug,
      title,
      question,
      answer_plain,
      similarity
    FROM perlcode.search_questions_semantic(
      ${vec}::vector(1536),
      ${threshold},
      ${limit}
    )
  `;
}

export async function searchQuestionsFulltext(
  query: string,
  limit = 20,
): Promise<QuestionRow[]> {
  return await sql<QuestionRow[]>`
    SELECT
      id::text,
      slug,
      title,
      question,
      rank
    FROM perlcode.search_questions_fulltext(${query}, ${limit})
  `;
}

export async function recordPageView(
  slug: string,
  referrer?: string,
  userAgent?: string,
  country?: string,
): Promise<void> {
  await sql`
    INSERT INTO perlcode.page_views (slug, path, referrer, user_agent, country)
    VALUES (${slug}, NULL, ${referrer ?? null}, ${userAgent ?? null}, ${country ?? null})
  `;
}

export async function insertChatMessage(args: {
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string | null;
  latencyMs?: number | null;
  contextQuestionIds?: string[] | null;
}): Promise<void> {
  const contextIds =
    args.contextQuestionIds && args.contextQuestionIds.length
      ? sql.array(args.contextQuestionIds, "uuid")
      : null;

  await sql`
    INSERT INTO perlcode.chat_messages (
      session_id,
      role,
      content,
      model,
      latency_ms,
      context_question_ids
    ) VALUES (
      ${args.sessionId}::uuid,
      ${args.role},
      ${args.content},
      ${args.model ?? null},
      ${args.latencyMs ?? null},
      ${contextIds}
    )
  `;
}

export async function incrementSessionCounts(args: {
  sessionId: string;
  pageSlug?: string | null;
  incrementDaily: boolean;
}): Promise<void> {
  await sql`
    UPDATE perlcode.chat_sessions
    SET
      current_page_slug = COALESCE(${args.pageSlug ?? null}, current_page_slug),
      message_count = message_count + 1,
      daily_message_count = daily_message_count + ${args.incrementDaily ? 1 : 0},
      last_active_at = NOW()
    WHERE id = ${args.sessionId}::uuid
  `;
}

export async function incrementExecutionCounts(args: {
  sessionId: string;
  incrementDaily: boolean;
}): Promise<void> {
  await sql`
    UPDATE perlcode.chat_sessions
    SET
      execution_count = execution_count + 1,
      daily_execution_count = daily_execution_count + ${args.incrementDaily ? 1 : 0},
      last_active_at = NOW()
    WHERE id = ${args.sessionId}::uuid
  `;
}

export async function getChatHistory(
  sessionToken: string,
  limit = 50,
): Promise<ChatHistoryRow[]> {
  const sessions = await sql<{ id: string }[]>`
    SELECT id::text
    FROM perlcode.chat_sessions
    WHERE session_token = ${sessionToken}
    LIMIT 1
  `;

  if (!sessions.length) return [];

  return await sql<ChatHistoryRow[]>`
    SELECT role, content, created_at::text
    FROM perlcode.chat_messages
    WHERE session_id = ${sessions[0].id}::uuid
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;
}

export async function getExecutableQuestion(slug: string): Promise<{
  id: string;
  slug: string;
  title: string;
  codeSnippet: string | null;
  isVerified: boolean;
  publishedAt: string | null;
} | null> {
  const rows = await sql<
    {
      id: string;
      slug: string;
      title: string;
      code_snippet: string | null;
      is_verified: boolean;
      published_at: string | null;
    }[]
  >`
    SELECT
      id::text,
      slug,
      title,
      code_snippet,
      is_verified,
      published_at::text AS published_at
    FROM perlcode.questions
    WHERE slug = ${slug}
    LIMIT 1
  `;

  if (!rows.length) return null;

  return {
    id: rows[0].id,
    slug: rows[0].slug,
    title: rows[0].title,
    codeSnippet: rows[0].code_snippet,
    isVerified: rows[0].is_verified,
    publishedAt: rows[0].published_at,
  };
}

export async function insertCodeRun(args: {
  sessionId: string | null;
  slug: string;
  codeSnippet: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  runtimeMs: number;
  perlVersion: string | null;
}): Promise<void> {
  const sessionId = args.sessionId;
  await sql`
    INSERT INTO perlcode.code_runs (
      session_id,
      slug,
      code_snippet,
      stdout,
      stderr,
      exit_code,
      runtime_ms,
      perl_version
    ) VALUES (
      ${sessionId}::uuid,
      ${args.slug},
      ${args.codeSnippet},
      ${args.stdout},
      ${args.stderr},
      ${args.exitCode},
      ${args.runtimeMs},
      ${args.perlVersion}
    )
  `;
}
