import { Hono } from "hono";
import { recordPageView } from "../lib/db";

export const analyticsRoute = new Hono();

// Record a page view
analyticsRoute.post("/pageview", async (c) => {
  try {
    const { slug } = await c.req.json();

    if (!slug || typeof slug !== "string") {
      return c.json({ error: "Slug is required" }, 400);
    }

    // Extract headers
    const referrer = c.req.header("referer") || null;
    const userAgent = c.req.header("user-agent") || null;
    const country = c.req.header("cf-ipcountry") || null;

    await recordPageView(
      slug,
      referrer || undefined,
      userAgent || undefined,
      country || undefined,
    );

    return c.json({ success: true });
  } catch (err) {
    console.error("Analytics error:", err);
    return c.json({ error: "Failed to record page view" }, 500);
  }
});
