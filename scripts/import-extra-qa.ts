/**
 * Import extra Q&A from multi-LLM extraction
 */

import { sql } from "./db";
import { randomUUID } from "crypto";

interface QAEntry {
  title?: string;
  question: string;
  answer_html?: string;
  category: string;
  tags: string[];
  difficulty: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

async function importFromJson(filepath: string) {
  const file = Bun.file(filepath);
  const data: QAEntry[] = await file.json();

  console.log(`Importing ${data.length} entries from ${filepath}...`);

  let imported = 0;
  let skipped = 0;

  for (const entry of data) {
    const title = entry.title || entry.question;
    const slug = slugify(title);
    const answerHtml = entry.answer_html || "";

    // Check if already exists
    const existing = await sql`
      SELECT id FROM perlcode.questions WHERE slug = ${slug}
    `;

    if (existing.length > 0) {
      console.log(`  Skip (exists): ${title}`);
      skipped++;
      continue;
    }

    // Insert new entry
    await sql`
      INSERT INTO perlcode.questions (
        id, slug, title, question, answer_html, answer_plain,
        category, tags, difficulty,
        is_verified, published_at, is_reviewed,
        created_at, updated_at
      ) VALUES (
        ${randomUUID()}::uuid,
        ${slug},
        ${title},
        ${entry.question},
        ${answerHtml},
        ${answerHtml.replace(/<[^>]+>/g, "").slice(0, 2000)},
        ${entry.category || "general"},
        ${entry.tags || []},
        ${entry.difficulty || "intermediate"},
        FALSE,
        NULL,
        FALSE,
        NOW(),
        NOW()
      )
    `;

    console.log(`  Imported: ${title}`);
    imported++;
  }

  console.log(`\nDone: ${imported} imported, ${skipped} skipped`);
  return imported;
}

// Main
const files = process.argv.slice(2);
if (files.length === 0) {
  console.log("Usage: bun run import-extra-qa.ts <file.json> [file2.json ...]");
  process.exit(1);
}

let total = 0;
for (const file of files) {
  total += await importFromJson(file);
}

console.log(`\nTotal imported: ${total}`);
await sql.end({ timeout: 2 });
