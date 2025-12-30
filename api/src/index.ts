import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { chatRoute } from "./routes/chat";
import { searchRoute } from "./routes/search";
import { analyticsRoute } from "./routes/analytics";
import { executeRoute } from "./routes/execute";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: [
      "https://freeperlcode.com",
      "https://www.freeperlcode.com",
      "http://localhost:4321",
    ],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 86400,
  }),
);

// Health check
app.get("/", (c) => {
  return c.json({
    status: "ok",
    service: "perlcode-api",
    version: "0.1.0",
  });
});

// Routes
app.route("/api/chat", chatRoute);
app.route("/api/search", searchRoute);
app.route("/api/analytics", analyticsRoute);
app.route("/api/execute", executeRoute);

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error("Error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

const port = Number(process.env.PORT) || 3000;

console.log(`PerlCode API running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
