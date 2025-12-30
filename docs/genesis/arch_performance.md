# Perl Knowledge Base - GOD OF PERFORMANCE Architecture

> Note (2025-12-29): This doc is historical. Current implementation: `docs/ARCHITECTURE.md` and `docs/SEO_ROLLOUT.md`.

## Executive Summary

A static-first, edge-optimized architecture that serves 3,000+ Perl question pages with sub-100ms loads, instant search via pre-computed indexes, and streaming AI chat through a minimal backend proxy.

---

## 1. Tech Stack

| Layer                  | Technology                        | Rationale                                                  |
| ---------------------- | --------------------------------- | ---------------------------------------------------------- |
| **Static Generator**   | Astro 5.x + `@astrojs/cloudflare` | Zero JS by default, partial hydration, fastest build times |
| **Frontend Framework** | Preact (for chat widget only)     | 3KB gzipped, compatible JSX                                |
| **Search**             | Pagefind 1.x (static search)      | Client-side, zero-latency after initial load               |
| **Backend Proxy**      | Cloudflare Workers                | Edge-deployed, <10ms cold start                            |
| **Database**           | Supabase PostgreSQL + pg_trgm     | Trigram indexes for fast text search                       |
| **Cache**              | Cloudflare KV + R2                | KV for hot paths, R2 for static assets                     |
| **AI**                 | VectorEngine API (grok-4-fast)    | Streaming via Workers proxy                                |

---

## 2. Database Design (Read-Optimized)

Schema: `perlcode`

```sql
-- Core questions table - denormalized for single-query reads
CREATE SCHEMA IF NOT EXISTS perlcode;

CREATE TABLE IF NOT EXISTS perlcode.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(500) NOT NULL,
  question_text TEXT NOT NULL,
  answer_html TEXT NOT NULL,           -- Pre-rendered HTML, no runtime processing
  answer_plain TEXT NOT NULL,          -- For search/AI context
  category VARCHAR(100) NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  difficulty VARCHAR(20) DEFAULT 'intermediate',
  word_count INTEGER GENERATED ALWAYS AS (array_length(regexp_split_to_array(answer_plain, '\s+'), 1)) STORED,
  reading_time INTEGER GENERATED ALWAYS AS (array_length(regexp_split_to_array(answer_plain, '\s+'), 1) / 200) STORED,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', title), 'A') ||
    setweight(to_tsvector('english', question_text), 'B') ||
    setweight(to_tsvector('english', answer_plain), 'C')
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Blazing fast indexes
CREATE INDEX IF NOT EXISTS idx_questions_slug ON perlcode.questions(slug);
CREATE INDEX IF NOT EXISTS idx_questions_category ON perlcode.questions(category);
CREATE INDEX IF NOT EXISTS idx_questions_tags ON perlcode.questions USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_questions_search ON perlcode.questions USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_questions_trgm ON perlcode.questions USING GIN(title gin_trgm_ops);

-- RAG chunks for AI context
CREATE TABLE IF NOT EXISTS perlcode.rag_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID REFERENCES perlcode.questions(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),
  token_count INTEGER NOT NULL,
  UNIQUE(question_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_rag_embedding ON perlcode.rag_chunks
  USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);
```

---

## 3. Caching Strategy

### Layer 1: Cloudflare Edge Cache (Pages)

- Static HTML/CSS/JS: `Cache-Control: public, max-age=31536000, immutable`
- HTML pages: `Cache-Control: public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400`

### Layer 2: Cloudflare KV (Hot Data)

- search-index: 24 hours
- category-list: 1 hour
- popular-questions: 5 minutes
- ai-context-chunks: 1 hour

### Layer 3: Browser Cache

- Service Worker for instant repeat visits
- Cache question pages and search index

---

## 4. API Design

### Cloudflare Worker - `/api/chat` (AI Proxy)

- Rate limiting: 20 requests/minute per IP (Durable Objects)
- Context lookup from KV (pre-computed during build)
- Streaming response from VectorEngine
- CORS restricted to perlcode.dev

### API Endpoints

| Endpoint       | Method | Rate Limit | Cache     |
| -------------- | ------ | ---------- | --------- |
| `/api/chat`    | POST   | 20/min/IP  | None      |
| `/api/search`  | GET    | 100/min/IP | Edge 5min |
| `/api/suggest` | GET    | 200/min/IP | Edge 1hr  |

---

## 5. Frontend Rendering (100% Static)

- Astro with full static generation
- Inline critical CSS
- LightningCSS minification
- Preact chat widget (only component that hydrates)
- Pagefind for client-side search (lazy-loaded on focus)

---

## 6. AI Pipeline (Minimum Latency)

```
User Input (Browser)
    │
    ▼ [~10ms]
Cloudflare Worker (Edge, nearest POP)
    │
    ├── Rate limit check (Durable Object) [~5ms]
    ├── Context lookup (KV) [~5ms]
    │
    ▼ [~100-200ms to first token]
VectorEngine API (grok-4-fast, streaming)
    │
    ▼ [Streaming]
Browser (incremental render)
```

---

## 7. Performance Metrics (Expected)

| Metric         | Target | Expected                |
| -------------- | ------ | ----------------------- |
| TTFB           | <100ms | ~30ms (edge cache hit)  |
| LCP            | <1s    | ~400ms                  |
| FID            | <50ms  | <10ms (minimal JS)      |
| CLS            | <0.1   | 0 (no layout shifts)    |
| Search latency | <50ms  | ~20ms (Pagefind)        |
| AI first token | <500ms | ~200ms                  |
| Total JS       | <10KB  | ~6KB (chat widget only) |

---

## Confidence Score: 9/10

**Reasoning:**

- Static-first with Astro eliminates server rendering latency
- Pagefind provides instant client-side search without API calls
- Cloudflare Workers at edge minimize AI proxy latency
- Pre-rendered HTML with minimal JS achieves near-instant page loads
- KV caching for RAG context avoids database round-trips during chat
