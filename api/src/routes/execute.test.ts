import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { Hono } from "hono";
import { sql } from "../lib/db";
import { executeRoute } from "./execute";

const app = new Hono();
app.route("/api/execute", executeRoute);

async function cleanup(args: { slug: string; sessionToken: string }) {
  await sql`DELETE FROM perlcode.code_runs WHERE slug = ${args.slug}`;
  await sql`DELETE FROM perlcode.questions WHERE slug = ${args.slug}`;
  await sql`DELETE FROM perlcode.chat_sessions WHERE session_token = ${args.sessionToken}`;
}

afterAll(async () => {
  await sql.end({ timeout: 2 });
});

describe("POST /api/execute", () => {
  test("returns 400 when slug is missing", async () => {
    const res = await app.request("/api/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cf-connecting-ip": "127.0.0.1",
      },
      body: JSON.stringify({ sessionToken: randomUUID() }),
    });

    expect(res.status).toBe(400);
  });

  test("rejects draft/unverified pages (403)", async () => {
    const slug = `test-exec-draft-${randomUUID()}`;
    const sessionToken = randomUUID();

    try {
      await sql`
        INSERT INTO perlcode.questions (
          slug,
          title,
          question,
          answer_html,
          answer_plain,
          category,
          difficulty,
          code_snippet,
          is_verified
        ) VALUES (
          ${slug},
          'Draft',
          'Draft question?',
          '<p>draft</p>',
          'draft',
          'general',
          'intermediate',
          'print qq(draft\\n);',
          TRUE
        )
      `;

      const res = await app.request("/api/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "cf-connecting-ip": "127.0.0.1",
        },
        body: JSON.stringify({ slug, sessionToken }),
      });

      expect(res.status).toBe(403);
    } finally {
      await cleanup({ slug, sessionToken });
    }
  });

  test("executes verified + published code and enforces daily limit", async () => {
    process.env.DAILY_EXECUTION_LIMIT = "1";

    const slug = `test-exec-ok-${randomUUID()}`;
    const sessionToken = randomUUID();

    try {
      await sql`
        INSERT INTO perlcode.questions (
          slug,
          title,
          question,
          answer_html,
          answer_plain,
          category,
          difficulty,
          code_snippet,
          is_verified,
          verified_at,
          published_at
        ) VALUES (
          ${slug},
          'OK',
          'OK question?',
          '<p>ok</p>',
          'ok',
          'general',
          'intermediate',
          'print qq(hi\\n);',
          TRUE,
          NOW(),
          NOW()
        )
      `;

      const res1 = await app.request("/api/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "cf-connecting-ip": "127.0.0.1",
        },
        body: JSON.stringify({ slug, sessionToken }),
      });

      expect(res1.status).toBe(200);
      const payload1 = (await res1.json()) as any;
      expect(payload1.success).toBe(true);
      expect(payload1.stdout).toBe("hi\n");
      expect(payload1.exitCode).toBe(0);
      expect(payload1.remaining).toBe(0);

      const runs = await sql<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM perlcode.code_runs
        WHERE slug = ${slug}
      `;
      expect(runs[0]?.count).toBe(1);

      const res2 = await app.request("/api/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "cf-connecting-ip": "127.0.0.1",
        },
        body: JSON.stringify({ slug, sessionToken }),
      });

      expect(res2.status).toBe(429);
    } finally {
      await cleanup({ slug, sessionToken });
      delete process.env.DAILY_EXECUTION_LIMIT;
    }
  });
});
