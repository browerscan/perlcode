import { Hono } from "hono";
import { createHash } from "crypto";
import {
  getOrCreateSession,
  getChatHistory,
  incrementSessionCounts,
  insertChatMessage,
  searchQuestionsSemantic,
} from "../lib/db";
import {
  createChatCompletion,
  createEmbedding,
  buildSystemPrompt,
  formatContext,
} from "../lib/vectorengine";

const DAILY_LIMIT = 10;

export const chatRoute = new Hono();

// Rate limit check middleware
async function checkRateLimit(
  sessionToken: string,
  ipHash: string,
): Promise<{ allowed: boolean; remaining: number; session: any }> {
  const session = await getOrCreateSession(sessionToken, ipHash);

  if (session.daily_message_count >= DAILY_LIMIT) {
    return {
      allowed: false,
      remaining: 0,
      session,
    };
  }

  return {
    allowed: true,
    remaining: DAILY_LIMIT - session.daily_message_count,
    session,
  };
}

chatRoute.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { message, sessionToken, pageSlug } = body;

    if (!message || typeof message !== "string") {
      return c.json({ error: "Message is required" }, 400);
    }

    if (!sessionToken || typeof sessionToken !== "string") {
      return c.json({ error: "Session token is required" }, 400);
    }

    // Hash IP for privacy
    const clientIP =
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-forwarded-for")?.split(",")[0] ||
      "unknown";
    const ipHash = createHash("sha256").update(clientIP).digest("hex");

    // Check rate limit
    const { allowed, remaining, session } = await checkRateLimit(
      sessionToken,
      ipHash,
    );

    if (!allowed) {
      return c.json(
        {
          error: "Daily limit reached. Come back tomorrow for more questions!",
          limit: DAILY_LIMIT,
          remaining: 0,
        },
        429,
      );
    }

    // Get RAG context
    let contextQuestions: any[] = [];
    let context = "";

    try {
      // Create embedding for the user's question
      const embeddings = await createEmbedding(message);
      if (embeddings.length > 0) {
        // Search for similar questions
        contextQuestions = await searchQuestionsSemantic(embeddings[0], 0.6, 3);
        context = formatContext(contextQuestions);
      }
    } catch (err) {
      console.error("RAG context error:", err);
      // Continue without context if RAG fails
    }

    // Build messages array
    const messages = [
      { role: "system" as const, content: buildSystemPrompt(context) },
      { role: "user" as const, content: message },
    ];

    // Save user message to database
    const startTime = Date.now();
    await insertChatMessage({
      sessionId: session.id,
      role: "user",
      content: message,
    });

    await incrementSessionCounts({
      sessionId: session.id,
      pageSlug: pageSlug ? String(pageSlug) : null,
      incrementDaily: true,
    });

    // Get streaming response from VectorEngine
    const aiResponse = await createChatCompletion(messages);

    // Stream the response back to the client
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Process the stream in the background
    (async () => {
      const reader = aiResponse.body?.getReader();
      if (!reader) {
        await writer.close();
        return;
      }

      const decoder = new TextDecoder();
      let fullContent = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          await writer.write(new TextEncoder().encode(chunk));

          // Extract content for saving
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || "";
                fullContent += content;
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      } finally {
        await writer.close();

        // Save assistant message to database
        const latency = Date.now() - startTime;
        await insertChatMessage({
          sessionId: session.id,
          role: "assistant",
          content: fullContent,
          model: "grok-4-fast-non-reasoning",
          latencyMs: latency,
          contextQuestionIds: contextQuestions.map((q) => q.id),
        });
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-RateLimit-Remaining": String(remaining - 1),
      },
    });
  } catch (err) {
    console.error("Chat error:", err);
    return c.json({ error: "Failed to process chat request" }, 500);
  }
});

// Get chat history for a session
chatRoute.get("/history", async (c) => {
  const sessionToken = c.req.query("sessionToken");

  if (!sessionToken) {
    return c.json({ error: "Session token required" }, 400);
  }

  const messages = await getChatHistory(sessionToken, 50);
  return c.json({ messages });
});
