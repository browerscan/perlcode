import { createHash } from "crypto";
import { Hono } from "hono";
import {
  getExecutableQuestion,
  getOrCreateSession,
  incrementExecutionCounts,
  insertCodeRun,
} from "../lib/db";
import { executePerlInDockerSandbox } from "../lib/sandbox";

const DEFAULT_DAILY_LIMIT = 20;
const DEFAULT_CONCURRENCY = 2;

class Semaphore {
  private readonly queue: Array<() => void> = [];
  private available: number;

  constructor(private readonly capacity: number) {
    this.available = Math.max(1, capacity);
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available--;
      return () => this.release();
    }

    return await new Promise((resolve) => {
      this.queue.push(() => {
        this.available--;
        resolve(() => this.release());
      });
    });
  }

  private release() {
    this.available++;
    const next = this.queue.shift();
    if (next) next();
  }
}

const executionSemaphore = new Semaphore(
  Number(process.env.EXECUTION_CONCURRENCY || DEFAULT_CONCURRENCY),
);

export const executeRoute = new Hono();

executeRoute.post("/", async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    const slug = body?.slug;
    const sessionToken = body?.sessionToken;

    if (!slug || typeof slug !== "string") {
      return c.json({ error: "Slug is required" }, 400);
    }

    if (!sessionToken || typeof sessionToken !== "string") {
      return c.json({ error: "Session token is required" }, 400);
    }

    const dailyLimit = Math.max(
      1,
      Number(process.env.DAILY_EXECUTION_LIMIT || DEFAULT_DAILY_LIMIT),
    );

    const clientIP =
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-forwarded-for")?.split(",")[0] ||
      "unknown";
    const ipHash = createHash("sha256").update(clientIP).digest("hex");

    const session = await getOrCreateSession(sessionToken, ipHash);

    if (session.daily_execution_count >= dailyLimit) {
      return c.json(
        {
          error: "Daily execution limit reached. Try again tomorrow.",
          limit: dailyLimit,
          remaining: 0,
        },
        429,
      );
    }

    const q = await getExecutableQuestion(slug);
    if (!q) return c.json({ error: "Not found" }, 404);

    // Only allow reruns for content that has passed verification and is published.
    if (!q.isVerified || !q.publishedAt || !q.codeSnippet) {
      return c.json(
        { error: "Code execution is not available for this page" },
        403,
      );
    }

    const release = await executionSemaphore.acquire();
    try {
      const timeoutMs = Math.max(
        250,
        Number(process.env.EXECUTION_TIMEOUT_MS || "2000"),
      );
      const image = process.env.EXECUTION_IMAGE || "perl:5.38-slim";

      const result = await executePerlInDockerSandbox(q.codeSnippet, {
        timeoutMs,
        image,
      });

      await insertCodeRun({
        sessionId: session.id,
        slug: q.slug,
        codeSnippet: q.codeSnippet,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        runtimeMs: result.runtimeMs,
        perlVersion: result.perlVersion,
      });

      await incrementExecutionCounts({
        sessionId: session.id,
        incrementDaily: true,
      });

      const remaining = Math.max(
        0,
        dailyLimit - (session.daily_execution_count + 1),
      );

      return c.json(
        {
          success: result.success,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          runtimeMs: result.runtimeMs,
          perlVersion: result.perlVersion,
          remaining,
        },
        200,
        {
          "Cache-Control": "no-store",
        },
      );
    } finally {
      release();
    }
  } catch (err) {
    console.error("Execute error:", err);
    return c.json({ error: "Execution failed" }, 500);
  }
});
