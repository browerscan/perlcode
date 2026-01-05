/**
 * Import generated JSON answers to database
 * Updates existing questions or inserts new ones
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { sql } from "./db";

interface GeneratedAnswer {
  question: string;
  title: string;
  answer_html: string;
  answer_plain: string;
  category: string;
  tags: string[];
  difficulty: string;
  code_snippet?: string;
  code_stdout?: string;
  code_stderr?: string;
  code_exit_code?: number;
  code_runtime_ms?: number;
  is_verified?: boolean;
  verified_at?: string;
}

const GENERATED_DIR = join(__dirname, "../generated-answers");

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 250);
}

async function importFile(filename: string): Promise<{
  imported: number;
  updated: number;
  skipped: number;
}> {
  const filepath = join(GENERATED_DIR, filename);
  let stats = { imported: 0, updated: 0, skipped: 0 };

  try {
    const content = readFileSync(filepath, "utf-8");
    const data: GeneratedAnswer = JSON.parse(content);

    // Skip if no answer
    if (!data.answer_html || data.answer_html.trim().length === 0) {
      stats.skipped++;
      return stats;
    }

    const slug = slugify(data.question);

    // Check if question exists
    const existing = await sql`
      SELECT id FROM perlcode.questions WHERE slug = ${slug}
    `;

    if (existing.length > 0) {
      // Update existing question
      await sql`
        UPDATE perlcode.questions
        SET
          title = ${data.title},
          question = ${data.question},
          answer_html = ${data.answer_html},
          answer_plain = ${data.answer_plain},
          category = ${data.category},
          tags = ${data.tags},
          difficulty = ${data.difficulty},
          code_snippet = ${data.code_snippet || null},
          code_stdout = ${data.code_stdout || null},
          code_stderr = ${data.code_stderr || null},
          code_exit_code = ${data.code_exit_code || null},
          code_runtime_ms = ${data.code_runtime_ms || null},
          is_verified = ${data.is_verified || false},
          verified_at = ${data.verified_at || null},
          updated_at = NOW()
        WHERE slug = ${slug}
      `;
      stats.updated++;
      console.log(`  ✓ Updated: ${filename}`);
    } else {
      // Insert new question
      await sql`
        INSERT INTO perlcode.questions (
          slug, title, question, answer_html, answer_plain,
          category, tags, difficulty,
          code_snippet, code_stdout, code_stderr, code_exit_code, code_runtime_ms,
          is_verified, verified_at,
          source
        ) VALUES (
          ${slug}, ${data.title}, ${data.question}, ${data.answer_html}, ${data.answer_plain},
          ${data.category}, ${data.tags}, ${data.difficulty},
          ${data.code_snippet || null}, ${data.code_stdout || null}, ${data.code_stderr || null},
          ${data.code_exit_code || null}, ${data.code_runtime_ms || null},
          ${data.is_verified || false}, ${data.verified_at || null},
          'generated'
        )
      `;
      stats.imported++;
      console.log(`  + Imported: ${filename}`);
    }
  } catch (err) {
    console.error(`  ✗ Error importing ${filename}:`, err);
    stats.skipped++;
  }

  return stats;
}

async function main() {
  console.log("Starting import of generated answers...\n");

  const files = readdirSync(GENERATED_DIR).filter((f) => f.endsWith(".json"));
  console.log(`Found ${files.length} JSON files\n`);

  const batchSize = 50;
  let totalStats = { imported: 0, updated: 0, skipped: 0 };

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    console.log(
      `\nBatch ${Math.floor(i / batchSize) + 1}/${Math.ceil(files.length / batchSize)}:`,
    );

    for (const file of batch) {
      const stats = await importFile(file);
      totalStats.imported += stats.imported;
      totalStats.updated += stats.updated;
      totalStats.skipped += stats.skipped;
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("Import complete!");
  console.log(`New imports: ${totalStats.imported}`);
  console.log(`Updated: ${totalStats.updated}`);
  console.log(`Skipped: ${totalStats.skipped}`);
  console.log(`Total processed: ${files.length}`);
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
