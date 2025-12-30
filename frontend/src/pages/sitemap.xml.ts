import type { APIRoute } from "astro";
import {
  isIndexableQuestion,
  loadCategories,
  loadQuestions,
} from "@/lib/generated";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const GET: APIRoute = async ({ site }) => {
  if (!site) {
    return new Response("Missing site config", { status: 500 });
  }

  const questions = await loadQuestions();
  const categories = await loadCategories();

  const urls: Array<{ loc: string; lastmod?: string }> = [];

  const add = (path: string, lastmod?: string | null) => {
    urls.push({
      loc: new URL(path, site).href,
      lastmod: lastmod ? new Date(lastmod).toISOString() : undefined,
    });
  };

  // Core pages
  add("/");
  add("/topics");
  add("/questions");
  add("/about");
  add("/privacy");
  add("/terms");

  // Topic hubs (only if they have indexable content)
  for (const c of categories) {
    if (c.indexable > 0) add(`/topics/${c.slug}`);
  }

  // Indexable questions only
  for (const q of questions) {
    if (!isIndexableQuestion(q)) continue;
    add(`/questions/${q.slug}`, q.published_at);
  }

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map((u) => {
        const lastmod = u.lastmod
          ? `<lastmod>${xmlEscape(u.lastmod)}</lastmod>`
          : "";
        return `  <url><loc>${xmlEscape(u.loc)}</loc>${lastmod}</url>`;
      })
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
};
