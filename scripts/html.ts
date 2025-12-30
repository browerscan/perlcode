export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function extractFirstPerlCodeBlockFromHtml(html: string): string | null {
  const match = html.match(
    /<pre><code[^>]*class="[^"]*language-perl[^"]*"[^>]*>([\s\S]*?)<\/code><\/pre>/i,
  );
  if (!match) return null;
  const raw = match[1] ?? "";
  const decoded = decodeHtmlEntities(raw);
  const code = decoded.replace(/\r\n/g, "\n").trim();
  return code.length ? `${code}\n` : null;
}
