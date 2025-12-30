import { Hono } from "hono";
import { searchQuestionsFulltext } from "../lib/db";

export const searchRoute = new Hono();

// Full-text search
searchRoute.get("/", async (c) => {
  const query = c.req.query("q");
  const limit = Math.min(Number(c.req.query("limit")) || 20, 50);

  if (!query || query.length < 2) {
    return c.json({ error: "Query must be at least 2 characters" }, 400);
  }

  try {
    const results = await searchQuestionsFulltext(query, limit);

    return c.json({
      query,
      count: results.length,
      results: results.map((r) => ({
        slug: r.slug,
        title: r.title,
        question: r.question,
        rank: r.rank,
      })),
    });
  } catch (err) {
    console.error("Search error:", err);
    return c.json({ error: "Search failed" }, 500);
  }
});

// Autocomplete suggestions
searchRoute.get("/suggest", async (c) => {
  const query = c.req.query("q");

  if (!query || query.length < 2) {
    return c.json({ suggestions: [] });
  }

  try {
    const results = await searchQuestionsFulltext(query, 5);

    return c.json({
      suggestions: results.map((r) => ({
        slug: r.slug,
        title: r.title,
      })),
    });
  } catch (err) {
    console.error("Suggest error:", err);
    return c.json({ suggestions: [] });
  }
});
