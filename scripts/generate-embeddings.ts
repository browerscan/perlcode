/**
 * Generate embeddings for questions to enable RAG-powered chat
 *
 * Uses text-embedding-3-small via VectorEngine API
 */

import { sql, toPgvector } from "./db";

const VECTORENGINE_BASE =
  process.env.VECTORENGINE_BASE_URL || "https://api.vectorengine.ai";
const VECTORENGINE_URL = `${VECTORENGINE_BASE}/v1`;
const VECTORENGINE_TOKEN = process.env.VECTORENGINE_TOKEN || "";

interface Question {
  id: string;
  title: string;
  question: string;
  answer_plain: string;
}

async function createEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${VECTORENGINE_URL}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VECTORENGINE_TOKEN}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

function prepareTextForEmbedding(question: Question): string {
  // Combine title, question, and first part of answer for embedding
  const parts = [
    question.title,
    question.question !== question.title ? question.question : "",
    question.answer_plain?.substring(0, 1000) || "",
  ].filter(Boolean);

  return parts.join("\n\n");
}

async function main() {
  const batchSize = Number(process.argv[2]) || 50;
  const startFrom = Number(process.argv[3]) || 0;

  console.log(
    `Generating embeddings for ${batchSize} questions starting from ${startFrom}...`,
  );

  // Get questions without embeddings that have answers
  const questions = await sql<Question[]>`
    SELECT id::text, title, question, answer_plain
    FROM perlcode.questions
    WHERE
      embedding IS NULL
      AND answer_plain <> ''
    ORDER BY created_at ASC
    OFFSET ${startFrom}
    LIMIT ${batchSize}
  `;

  if (!questions || questions.length === 0) {
    console.log("No questions without embeddings found.");
    return;
  }

  console.log(`Found ${questions.length} questions to process`);

  let success = 0;
  let failed = 0;

  for (const question of questions) {
    console.log(`Processing: ${question.title.substring(0, 50)}...`);

    try {
      const text = prepareTextForEmbedding(question);
      const embedding = await createEmbedding(text);
      const vec = toPgvector(embedding);

      // Update database
      await sql`
        UPDATE perlcode.questions
        SET embedding = ${vec}::vector(1536)
        WHERE id = ${question.id}::uuid
      `;

      console.log(`  Generated embedding (${embedding.length} dimensions)`);
      success++;

      // Rate limit: small delay between requests
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (err) {
      console.error(`  Embedding error: ${err}`);
      failed++;
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${questions.length}`);
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
