/**
 * Publish verified questions gradually (SEO-safe rollout).
 *
 * Marks `published_at = NOW()` for a limited number of verified rows.
 *
 * Usage:
 *   bun run publish.ts --count 50
 *   bun run publish.ts --count 50 --mode even
 *   bun run publish.ts --count 50 --dry-run
 */

import { sql } from "./db";

type Mode = "even" | "oldest";

function parseArgs(argv: string[]) {
  const args = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, true);
    } else {
      args.set(key, next);
      i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const count = Math.max(1, Math.min(Number(args.get("count") ?? "50"), 500));
  const mode = (args.get("mode") ?? "even") as Mode;
  const dryRun = args.get("dry-run") === true;

  if (mode !== "even" && mode !== "oldest") {
    console.error(`Invalid --mode "${mode}". Use "even" or "oldest".`);
    process.exitCode = 2;
    return;
  }

  if (dryRun) {
    const rows =
      mode === "even"
        ? await sql<
            { slug: string; category: string | null; created_at: string }[]
          >`
            WITH published AS (
              SELECT COALESCE(category, 'general') AS category, COUNT(*) AS published_count
              FROM perlcode.questions
              WHERE published_at IS NOT NULL AND is_verified = TRUE
              GROUP BY 1
            ),
            candidates AS (
              SELECT
                slug,
                category,
                created_at,
                COALESCE(category, 'general') AS cat_norm,
                ROW_NUMBER() OVER (
                  PARTITION BY COALESCE(category, 'general')
                  ORDER BY created_at ASC
                ) AS rn
              FROM perlcode.questions
              WHERE
                published_at IS NULL
                AND is_verified = TRUE
                AND answer_html <> ''
            )
            SELECT c.slug, c.category, c.created_at::text
            FROM candidates c
            LEFT JOIN published p ON p.category = c.cat_norm
            ORDER BY COALESCE(p.published_count, 0) ASC, c.rn ASC, c.created_at ASC
            LIMIT ${count}
          `
        : await sql<
            { slug: string; category: string | null; created_at: string }[]
          >`
            SELECT slug, category, created_at::text
            FROM perlcode.questions
            WHERE
              published_at IS NULL
              AND is_verified = TRUE
              AND answer_html <> ''
            ORDER BY created_at ASC
            LIMIT ${count}
          `;

    console.log(`Dry run: would publish ${rows.length} pages (mode=${mode})`);
    for (const r of rows) {
      console.log(`${r.slug}  [${r.category || "general"}]  ${r.created_at}`);
    }
    return;
  }

  const updated =
    mode === "even"
      ? await sql<{ id: string; slug: string; category: string | null }[]>`
          WITH published AS (
            SELECT COALESCE(category, 'general') AS category, COUNT(*) AS published_count
            FROM perlcode.questions
            WHERE published_at IS NOT NULL AND is_verified = TRUE
            GROUP BY 1
          ),
          candidates AS (
            SELECT
              id,
              COALESCE(category, 'general') AS cat_norm,
              created_at,
              ROW_NUMBER() OVER (
                PARTITION BY COALESCE(category, 'general')
                ORDER BY created_at ASC
              ) AS rn
            FROM perlcode.questions
            WHERE
              published_at IS NULL
              AND is_verified = TRUE
              AND answer_html <> ''
          ),
          picked AS (
            SELECT c.id
            FROM candidates c
            LEFT JOIN published p ON p.category = c.cat_norm
            ORDER BY COALESCE(p.published_count, 0) ASC, c.rn ASC, c.created_at ASC
            LIMIT ${count}
          )
          UPDATE perlcode.questions q
          SET published_at = NOW()
          FROM picked
          WHERE q.id = picked.id
          RETURNING q.id::text, q.slug, q.category
        `
      : await sql<{ id: string; slug: string; category: string | null }[]>`
          WITH picked AS (
            SELECT id
            FROM perlcode.questions
            WHERE
              published_at IS NULL
              AND is_verified = TRUE
              AND answer_html <> ''
            ORDER BY created_at ASC
            LIMIT ${count}
          )
          UPDATE perlcode.questions q
          SET published_at = NOW()
          FROM picked
          WHERE q.id = picked.id
          RETURNING q.id::text, q.slug, q.category
        `;

  console.log(`Published ${updated.length} pages (mode=${mode})`);
  for (const r of updated) {
    console.log(`${r.slug}  [${r.category || "general"}]`);
  }
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
