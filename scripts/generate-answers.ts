/**
 * Generate AI answers for questions using VectorEngine API
 *
 * Uses claude-sonnet for high-quality content generation
 */

import { sql } from "./db";
import { extractFirstPerlCodeBlockFromHtml } from "./html";
import { executePerlInSandbox } from "./sandbox";

const VECTORENGINE_URL =
  process.env.VECTORENGINE_BASE_URL || "https://api.vectorengine.ai";
const VECTORENGINE_API_URL = `${VECTORENGINE_URL}/v1`;
const VECTORENGINE_TOKEN = process.env.VECTORENGINE_TOKEN || "";

const SYSTEM_PROMPT = `You are an expert Perl programmer writing answers for a Perl knowledge base website called PerlCode.

Your answers should:
1. Be comprehensive but concise (200-500 words ideal)
2. Include at least one runnable Perl code example (a single main code block)
3. Explain Perl-specific concepts (sigils, context, TMTOWTDI)
4. Note version differences when relevant (Perl 5.10+, 5.16+, etc.)
5. Include common pitfalls or gotchas
6. Be SEO-friendly with clear structure
7. Prefer examples that print something to STDOUT (to prove execution)

Format your response in HTML with these elements:
- Use <p> for paragraphs
- Use <pre><code class="language-perl">...</code></pre> for code blocks
- Use <h3> for subheadings if needed
- Use <ul>/<li> for lists
- Use <code> for inline code

Code requirements (VERY IMPORTANT):
- The main Perl code block MUST be runnable as-is via: perl -
- Do NOT require network access
- Do NOT require reading/writing files
- Do NOT require external CPAN modules (core modules only)
- Keep runtime under 1 second (no infinite loops)

DO NOT include the question in your response - just the answer.
DO NOT use markdown - use HTML only.`;

interface Question {
  id: string;
  title: string;
  question: string;
  category: string | null;
  tags: string[] | null;
  difficulty: string | null;
  answer_html?: string | null;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/g, "\n$1\n") // Keep code blocks
    .replace(/<[^>]+>/g, "") // Remove other tags
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n") // Normalize newlines
    .trim();
}

async function callLLM(userPrompt: string): Promise<string> {
  if (!VECTORENGINE_TOKEN) {
    throw new Error("VECTORENGINE_TOKEN is required");
  }

  const response = await fetch(`${VECTORENGINE_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VECTORENGINE_TOKEN}`,
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}

async function generateAnswer(question: Question): Promise<string> {
  const userPrompt = `Write a comprehensive answer to this Perl question:

Title: ${question.title}
Category: ${question.category || "general"}
Difficulty: ${question.difficulty || "intermediate"}
Tags: ${(question.tags || []).join(", ")}

The question is: "${question.question}"

Provide a clear, helpful answer with a runnable code example.`;

  return await callLLM(userPrompt);
}

async function fixAnswer(args: {
  question: Question;
  previousAnswerHtml: string;
  code: string | null;
  executionError: string;
}): Promise<string> {
  const userPrompt = `Fix the Perl code example so it runs successfully in a sandbox.

Constraints reminder:
- Must run with: perl -
- No network access
- No filesystem access
- No external CPAN modules
- Finish quickly (< 1s)

Question: "${args.question.question}"
Title: ${args.question.title}

Previous answer HTML:
${args.previousAnswerHtml}

Extracted Perl code (may be empty):
${args.code || "(none)"}

Execution error:
${args.executionError}

Return a corrected full HTML answer. Keep it concise, keep the structure, and ensure there is a <pre><code class="language-perl">...</code></pre> block that executes successfully.`;

  return await callLLM(userPrompt);
}

async function main() {
  const batchSize = Number(process.argv[2]) || 10;
  const startFrom = Number(process.argv[3]) || 0;

  console.log(
    `Generating answers for ${batchSize} questions starting from ${startFrom}...`,
  );

  // Get questions needing answers or verification
  const questions = await sql<Question[]>`
    SELECT
      id::text,
      title,
      question,
      category,
      tags,
      difficulty,
      answer_html
    FROM perlcode.questions
    WHERE
      answer_html = ''
      OR answer_plain = ''
      OR is_verified = FALSE
    ORDER BY created_at ASC
    OFFSET ${startFrom}
    LIMIT ${batchSize}
  `;

  if (!questions || questions.length === 0) {
    console.log("No questions without answers found.");
    return;
  }

  console.log(`Found ${questions.length} questions to process`);

  let success = 0;
  let failed = 0;

  for (const question of questions) {
    console.log(`\nProcessing: ${question.title.substring(0, 50)}...`);

    try {
      const maxAttempts = 3;
      let attempt = 0;
      let answerHtml = (question.answer_html || "").trim();
      let lastError = "";
      let execResult: Awaited<ReturnType<typeof executePerlInSandbox>> | null =
        null;
      let code: string | null = null;

      while (attempt < maxAttempts) {
        attempt++;

        if (!answerHtml) {
          console.log(
            `  Generating answer (attempt ${attempt}/${maxAttempts})...`,
          );
          answerHtml = await generateAnswer(question);
        } else if (attempt > 1) {
          console.log(`  Fixing answer (attempt ${attempt}/${maxAttempts})...`);
          answerHtml = await fixAnswer({
            question,
            previousAnswerHtml: answerHtml,
            code,
            executionError: lastError,
          });
        }

        code = extractFirstPerlCodeBlockFromHtml(answerHtml);
        if (!code) {
          lastError =
            'No <pre><code class="language-perl">...</code></pre> block found in the HTML.';
          continue;
        }

        execResult = await executePerlInSandbox(code, {
          timeoutMs: 2000,
        });

        if (execResult.success) break;

        lastError = [
          `exitCode=${execResult.exitCode}`,
          execResult.timedOut ? "timedOut=true" : "",
          execResult.stderr ? `stderr:\n${execResult.stderr}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      }

      const answerPlain = htmlToPlainText(answerHtml);
      const verifiedAt = execResult?.success ? new Date().toISOString() : null;

      await sql`
        UPDATE perlcode.questions
        SET
          answer_html = ${answerHtml},
          answer_plain = ${answerPlain},
          code_snippet = ${code},
          code_stdout = ${execResult?.stdout ?? null},
          code_stderr = ${execResult?.stderr ?? null},
          code_exit_code = ${execResult?.exitCode ?? null},
          code_runtime_ms = ${execResult?.runtimeMs ?? null},
          perl_version = ${execResult?.perlVersion ?? null},
          is_verified = ${execResult?.success ?? false},
          verified_at = ${verifiedAt},
          is_reviewed = FALSE
        WHERE id = ${question.id}::uuid
      `;

      if (execResult?.success) {
        console.log(`  Verified ✅ (${execResult.runtimeMs}ms)`);
        success++;
      } else {
        console.log(`  Not verified ❌`);
        failed++;
      }

      // Rate limit: wait between requests
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`  Generation error: ${err}`);
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
