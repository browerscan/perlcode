import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ site }) => {
  const sitemapUrl = site ? new URL("/sitemap.xml", site).href : "/sitemap.xml";

  const body = [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${sitemapUrl}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
