// OpenRouter API client for AI chat
// OpenAI-compatible API at openrouter.ai

import { getEnv } from "../env";

const OPENROUTER_URL = "https://openrouter.ai/api/v1";
const env = getEnv();

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

interface EmbeddingRequest {
  model: string;
  input: string | string[];
}

interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

// Chat completion with streaming via OpenRouter
export async function createChatCompletion(
  messages: ChatMessage[],
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {},
): Promise<Response> {
  const {
    model = env.OPENROUTER_MODEL,
    temperature = 0.7,
    maxTokens = 1024,
  } = options;

  const response = await fetch(`${OPENROUTER_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://freeperlcode.com",
      "X-Title": "PerlCode",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature,
      max_tokens: maxTokens,
    } as ChatCompletionRequest),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${error}`);
  }

  return response;
}

// Create embeddings for RAG (temporarily disabled - returns empty)
// TODO: Integrate with OpenAI or other embedding provider
export async function createEmbedding(
  _input: string | string[],
): Promise<number[][]> {
  // Embeddings disabled - RAG will fall back to keyword search
  console.log("Embeddings disabled: RAG context unavailable");
  return [];
}

// Build system prompt for Perl assistant
export function buildSystemPrompt(context?: string): string {
  let prompt = `You are PerlCode, an expert AI assistant specialized in Perl programming.

Your knowledge includes:
- Perl 5 syntax, idioms, and best practices
- Common CPAN modules and their usage
- Regular expressions (Perl's powerful regex engine)
- File handling, text processing, and one-liners
- Legacy code patterns and modernization techniques
- Comparisons with Python/Ruby for developers transitioning

Guidelines:
- Always provide working code examples when relevant
- Explain Perl-specific concepts (like $_, @_, context sensitivity)
- Note version differences when applicable (Perl 5.10+, 5.16+, etc.)
- Cite sources when referencing documentation
- Admit uncertainty rather than guessing
- Keep responses concise but complete`;

  if (context) {
    prompt += `\n\nRelevant context from the knowledge base:\n${context}`;
  }

  return prompt;
}

// Format context from retrieved questions
export function formatContext(
  questions: Array<{ title: string; answer_plain: string }>,
): string {
  if (!questions.length) return "";

  return questions
    .map((q, i) => `[${i + 1}] ${q.title}\n${q.answer_plain}`)
    .join("\n\n---\n\n");
}
