/**
 * Export questions from database to JSON for Astro static build
 *
 * This creates JSON files that Astro uses during the build process.
 *
 * Output:
 * - frontend/src/generated/questions.json
 * - frontend/src/generated/categories.json
 * - frontend/src/generated/meta.json
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { sql } from "./db";

interface ExportedQuestion {
  slug: string;
  title: string;
  question: string;
  answer_html: string;
  category: string | null;
  tags: string[] | null;
  difficulty: string | null;
  created_at: string;
  published_at: string | null;
  is_verified: boolean;
  code_snippet: string | null;
  code_stdout: string | null;
  code_stderr: string | null;
  code_runtime_ms: number | null;
  perl_version: string | null;
}

async function main() {
  console.log("Exporting questions for Astro build...");

  // Export all answered questions; indexing is controlled by `is_verified + published_at`
  const questions = await sql<ExportedQuestion[]>`
    SELECT
      slug,
      title,
      question,
      answer_html,
      category,
      tags,
      difficulty,
      created_at::text AS created_at,
      published_at::text AS published_at,
      is_verified,
      code_snippet,
      code_stdout,
      code_stderr,
      code_runtime_ms,
      perl_version
    FROM perlcode.questions
    WHERE
      answer_html <> ''
    ORDER BY created_at DESC
  `;

  if (!questions || questions.length === 0) {
    console.log("No answered questions found.");
    return;
  }

  const normalizedQuestions = questions.map((q) => ({
    ...q,
    category: q.category || "general",
    tags: q.tags || [],
    is_indexable: Boolean(q.is_verified && q.published_at),
  }));

  console.log(`Found ${questions.length} questions to export`);

  // Create output directory
  const outputDir = join(__dirname, "../frontend/src/generated");
  mkdirSync(outputDir, { recursive: true });

  // Export all questions
  const outputPath = join(outputDir, "questions.json");
  writeFileSync(outputPath, JSON.stringify(normalizedQuestions, null, 2));
  console.log(`Exported to ${outputPath}`);

  // Export categories for topic pages
  const byCategory: Record<
    string,
    { total: number; verified: number; indexable: number }
  > = {};
  for (const q of normalizedQuestions) {
    const cat = q.category;
    if (!byCategory[cat])
      byCategory[cat] = { total: 0, verified: 0, indexable: 0 };
    byCategory[cat].total += 1;
    if (q.is_verified) byCategory[cat].verified += 1;
    if (q.is_verified && q.published_at) byCategory[cat].indexable += 1;
  }

  const categoriesPath = join(outputDir, "categories.json");
  writeFileSync(
    categoriesPath,
    JSON.stringify(
      Object.entries(byCategory)
        .map(([name, stats]) => ({
          name,
          slug: name,
          total: stats.total,
          verified: stats.verified,
          indexable: stats.indexable,
        }))
        .sort((a, b) => b.total - a.total),
      null,
      2,
    ),
  );
  console.log(`Exported categories to ${categoriesPath}`);

  const metaPath = join(outputDir, "meta.json");
  writeFileSync(
    metaPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        total_questions: normalizedQuestions.length,
        verified_questions: normalizedQuestions.filter((q) => q.is_verified)
          .length,
        indexable_questions: normalizedQuestions.filter((q) => q.is_indexable)
          .length,
      },
      null,
      2,
    ),
  );
  console.log(`Exported meta to ${metaPath}`);

  // Summary
  console.log("\n--- Export Summary ---");
  console.log(`Total questions: ${normalizedQuestions.length}`);
  console.log(`Categories: ${Object.keys(byCategory).length}`);
  console.log(
    `Verified: ${normalizedQuestions.filter((q) => q.is_verified).length}`,
  );
  console.log(
    `Indexable: ${normalizedQuestions.filter((q) => q.is_indexable).length}`,
  );
}

// Ensure the process exits cleanly (postgres keeps sockets open by default).
try {
  await main();
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
