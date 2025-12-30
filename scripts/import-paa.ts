/**
 * Import PAA (People Also Ask) data from CSV into the database
 *
 * Source: google-paa-perl-level8-28-12-2025.csv
 * Format: PAA Title, Parent, Text, URL, URL Title
 */

import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "./db";

interface PAARow {
  "PAA Title": string;
  Parent: string;
  Text: string;
  URL: string;
  "URL Title": string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // Remove special chars
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens
    .substring(0, 250); // Max length
}

function categorizeQuestion(title: string, parent: string): string {
  const lowerTitle = title.toLowerCase();
  const lowerParent = parent.toLowerCase();

  // Check for common categories
  if (lowerTitle.includes("regex") || lowerParent.includes("regex")) {
    return "regex";
  }
  if (
    lowerTitle.includes("file") ||
    lowerTitle.includes("read") ||
    lowerTitle.includes("write")
  ) {
    return "file-handling";
  }
  if (lowerTitle.includes("hash") || lowerTitle.includes("array")) {
    return "data-structures";
  }
  if (lowerTitle.includes("module") || lowerTitle.includes("cpan")) {
    return "modules";
  }
  if (
    lowerTitle.includes("$_") ||
    lowerTitle.includes("variable") ||
    lowerTitle.includes("sigil")
  ) {
    return "variables";
  }
  if (lowerTitle.includes("function") || lowerTitle.includes("subroutine")) {
    return "functions";
  }
  if (lowerTitle.includes("string") || lowerTitle.includes("text")) {
    return "strings";
  }
  if (lowerTitle.includes("loop") || lowerTitle.includes("iterate")) {
    return "control-flow";
  }
  if (lowerTitle.includes("debug") || lowerTitle.includes("error")) {
    return "debugging";
  }
  if (lowerTitle.includes("one-liner") || lowerTitle.includes("one liner")) {
    return "one-liners";
  }
  if (lowerTitle.includes("vs") || lowerTitle.includes("compare")) {
    return "comparisons";
  }

  return "general";
}

function extractTags(title: string): string[] {
  const tags: string[] = [];
  const lowerTitle = title.toLowerCase();

  // Extract keywords as tags
  const keywords = [
    "regex",
    "hash",
    "array",
    "scalar",
    "reference",
    "subroutine",
    "module",
    "cpan",
    "file",
    "string",
    "loop",
    "if",
    "unless",
    "while",
    "foreach",
    "map",
    "grep",
    "sort",
    "split",
    "join",
    "print",
    "chomp",
    "die",
    "warn",
    "strict",
    "warnings",
  ];

  for (const kw of keywords) {
    if (lowerTitle.includes(kw)) {
      tags.push(kw);
    }
  }

  // Add special variable tags
  if (lowerTitle.includes("$_")) tags.push("default-variable");
  if (lowerTitle.includes("@_")) tags.push("argument-array");
  if (lowerTitle.includes("%")) tags.push("hash");
  if (lowerTitle.includes("@")) tags.push("array");

  return [...new Set(tags)].slice(0, 10); // Unique, max 10
}

function estimateDifficulty(
  title: string,
): "beginner" | "intermediate" | "advanced" {
  const lowerTitle = title.toLowerCase();

  // Advanced topics
  const advancedKeywords = [
    "closure",
    "tie",
    "overload",
    "autoload",
    "moose",
    "moo",
    "dbi",
    "xs",
    "inline",
    "threads",
    "fork",
    "socket",
    "benchmark",
    "optimize",
  ];

  for (const kw of advancedKeywords) {
    if (lowerTitle.includes(kw)) return "advanced";
  }

  // Beginner topics
  const beginnerKeywords = [
    "what is",
    "how to",
    "basic",
    "simple",
    "first",
    "start",
    "beginner",
    "hello world",
    "print",
  ];

  for (const kw of beginnerKeywords) {
    if (lowerTitle.includes(kw)) return "beginner";
  }

  return "intermediate";
}

async function main() {
  console.log("Starting PAA import...");

  // Read CSV file
  const csvPath = join(
    __dirname,
    "../data/google-paa-perl-level8-28-12-2025.csv",
  );
  const csvContent = readFileSync(csvPath, "utf-8");

  // Parse CSV - handle embedded quotes and relaxed parsing
  const records: PAARow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
    bom: true,
  });

  console.log(`Found ${records.length} PAA questions`);

  // Deduplicate by title
  const seen = new Set<string>();
  const unique: PAARow[] = [];

  for (const row of records) {
    const title = row["PAA Title"].trim();
    if (!seen.has(title.toLowerCase()) && title.length > 10) {
      seen.add(title.toLowerCase());
      unique.push(row);
    }
  }

  console.log(`After deduplication: ${unique.length} unique questions`);

  // Batch insert
  const batchSize = 100;
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);

    const rows = batch.map((row) => {
      const title = row["PAA Title"].trim();
      const slug = slugify(title);

      return {
        slug,
        title,
        question: title, // Use title as question text initially
        answer_html: "", // Will be generated later
        answer_plain: "", // Will be generated later
        category: categorizeQuestion(title, row.Parent),
        tags: extractTags(title),
        difficulty: estimateDifficulty(title),
        source: "paa",
        source_url: row.URL || null,
      };
    });

    try {
      const result = await sql<{ id: string }[]>`
        INSERT INTO perlcode.questions ${sql(
          rows,
          "slug",
          "title",
          "question",
          "answer_html",
          "answer_plain",
          "category",
          "tags",
          "difficulty",
          "source",
          "source_url",
        )}
        ON CONFLICT (slug) DO NOTHING
        RETURNING id::text
      `;

      inserted += result.length;
      skipped += batch.length - result.length;
    } catch (err) {
      console.error(`Batch ${i / batchSize + 1} error:`, err);
      skipped += batch.length;
    }

    // Progress
    console.log(
      `Progress: ${Math.min(i + batchSize, unique.length)}/${unique.length}`,
    );
  }

  console.log("\nImport complete!");
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped (duplicates): ${skipped}`);
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
