/**
 * Verify code snippets in generated JSON files using Docker sandbox
 * Updates JSON files with actual execution results
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import { executePerlInSandbox } from "./sandbox";

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

async function verifyFile(filename: string): Promise<{
  verified: number;
  failed: number;
  skipped: number;
}> {
  const filepath = join(GENERATED_DIR, filename);
  let stats = { verified: 0, failed: 0, skipped: 0 };

  try {
    const content = readFileSync(filepath, "utf-8");
    const data: GeneratedAnswer = JSON.parse(content);

    // Skip if no code snippet
    if (!data.code_snippet || data.code_snippet.trim().length === 0) {
      stats.skipped++;
      return stats;
    }

    // Already verified?
    if (data.is_verified && data.code_stdout !== undefined) {
      stats.verified++;
      return stats;
    }

    console.log(`  Verifying: ${filename}`);

    // Execute code in sandbox
    const result = await executePerlInSandbox(data.code_snippet, {
      timeoutMs: 5000,
      image: "perl:5.38-slim",
    });

    // Update JSON with execution results
    data.code_stdout = result.stdout;
    data.code_stderr = result.stderr;
    data.code_exit_code = result.exitCode;
    data.code_runtime_ms = result.runtimeMs;
    data.is_verified = result.success;
    data.verified_at = new Date().toISOString();

    // Write back
    writeFileSync(filepath, JSON.stringify(data, null, 2) + "\n");

    if (result.success) {
      stats.verified++;
      console.log(`    ✓ Exit code: ${result.exitCode}, Runtime: ${result.runtimeMs}ms`);
    } else {
      stats.failed++;
      console.log(
        `    ✗ Exit code: ${result.exitCode}, Error: ${result.stderr.substring(0, 100)}...`,
      );
    }
  } catch (err) {
    console.error(`  Error verifying ${filename}:`, err);
    stats.failed++;
  }

  return stats;
}

async function main() {
  console.log("Starting code verification...\n");

  const files = readdirSync(GENERATED_DIR).filter((f) => f.endsWith(".json"));
  console.log(`Found ${files.length} JSON files\n`);

  // Process in batches to avoid overwhelming Docker
  const batchSize = 10;
  let totalStats = { verified: 0, failed: 0, skipped: 0 };

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    console.log(
      `\nBatch ${Math.floor(i / batchSize) + 1}/${Math.ceil(files.length / batchSize)}:`,
    );

    for (const file of batch) {
      const stats = await verifyFile(file);
      totalStats.verified += stats.verified;
      totalStats.failed += stats.failed;
      totalStats.skipped += stats.skipped;
    }

    // Small delay between batches
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\n" + "=".repeat(50));
  console.log("Verification complete!");
  console.log(`Verified: ${totalStats.verified}`);
  console.log(`Failed: ${totalStats.failed}`);
  console.log(`Skipped: ${totalStats.skipped}`);
  console.log(`Total: ${files.length}`);
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exitCode = 1;
}
