# PerlCode Knowledge Base - GENESIS Document

> Note (2025-12-29): The live implementation is described in `docs/ARCHITECTURE.md` and `docs/SEO_ROLLOUT.md` (verified-only indexing + VPS Docker Postgres/Bun API).

## 1. Executive Summary

**Project**: PerlCode - The AI-native knowledge base for Perl developers
**Tagline**: "The AI that actually understands Perl"

A static-first, SEO-optimized platform serving 3,000+ Perl Q&A pages with an AI chat widget. Built for the underserved market of legacy Perl maintainers, DevOps engineers inheriting Perl scripts, and bioinformatics researchers.

**Architecture Decision**: Hybrid approach combining **Performance** architecture's static generation with **Simplicity** architecture's VPS-based API proxy.

### Why This Combination?

| Aspect    | Performance Choice       | Simplicity Choice        | Final Decision                 |
| --------- | ------------------------ | ------------------------ | ------------------------------ |
| Frontend  | Astro + Cloudflare Pages | Astro + Cloudflare Pages | **Astro + Cloudflare Pages**   |
| Search    | Pagefind (client-side)   | N/A                      | **Pagefind**                   |
| API Proxy | Cloudflare Workers       | Bun + Hono on VPS        | **Bun + Hono on VPS**          |
| Database  | Complex (RAG chunks)     | Simple (4 tables)        | **Simple first, expand later** |
| Cache     | Cloudflare KV + R2       | None                     | **Browser + CDN only for MVP** |

---

## 2. Recommended Tech Stack

### Frontend (Static)

| Component   | Technology       | Rationale                                       |
| ----------- | ---------------- | ----------------------------------------------- |
| Framework   | Astro 5.x        | Zero JS by default, MDX support, fastest builds |
| Chat Widget | Preact           | 3KB gzipped, only component that hydrates       |
| Search      | Pagefind         | Client-side, zero-latency after initial load    |
| Hosting     | Cloudflare Pages | Free, global CDN, simple deploys                |
| Styling     | Tailwind CSS     | Utility-first, small bundle with purging        |

### Backend (VPS)

| Component | Technology          | Rationale                                           |
| --------- | ------------------- | --------------------------------------------------- |
| API Proxy | Bun + Hono          | Single file, fast, TypeScript, runs on existing VPS |
| Database  | Supabase PostgreSQL | Already running (32GB RAM), pgvector built-in       |
| Schema    | `perlcode`          | Isolated from other projects                        |

### AI Integration

| Component   | Technology                | Rationale                                      |
| ----------- | ------------------------- | ---------------------------------------------- |
| Chat Model  | grok-4-fast-non-reasoning | Fast responses, streaming, no API key exposure |
| Content Gen | claude-sonnet             | High-quality SEO content generation            |
| API Gateway | VectorEngine              | OpenAI-compatible, unified access              |
| RAG         | Embeddings + pgvector     | Semantic search for chat context               |

---

## 3. Database Schema (MVP)

```sql
-- Schema: perlcode
CREATE SCHEMA IF NOT EXISTS perlcode;

-- Questions table (the core content)
CREATE TABLE IF NOT EXISTS perlcode.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    question TEXT NOT NULL,
    answer_html TEXT NOT NULL,        -- Pre-rendered HTML
    answer_plain TEXT NOT NULL,       -- For search/AI context
    category VARCHAR(100),
    tags TEXT[] DEFAULT '{}',
    difficulty VARCHAR(20) DEFAULT 'intermediate',
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', title), 'A') ||
        setweight(to_tsvector('english', question), 'B') ||
        setweight(to_tsvector('english', answer_plain), 'C')
    ) STORED,
    embedding vector(1536),           -- For RAG
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat sessions (anonymous, no auth)
CREATE TABLE IF NOT EXISTS perlcode.chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token VARCHAR(64) UNIQUE NOT NULL,
    ip_hash VARCHAR(64),              -- For rate limiting
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages
CREATE TABLE IF NOT EXISTS perlcode.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES perlcode.chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,        -- 'user' or 'assistant'
    content TEXT NOT NULL,
    tokens_used INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analytics (simple page views)
CREATE TABLE IF NOT EXISTS perlcode.page_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(255) NOT NULL,
    referrer TEXT,
    user_agent TEXT,
    country VARCHAR(2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_questions_slug ON perlcode.questions(slug);
CREATE INDEX IF NOT EXISTS idx_questions_category ON perlcode.questions(category);
CREATE INDEX IF NOT EXISTS idx_questions_tags ON perlcode.questions USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_questions_search ON perlcode.questions USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_questions_embedding ON perlcode.questions
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON perlcode.chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_page_views_created ON perlcode.page_views(created_at);
CREATE INDEX IF NOT EXISTS idx_page_views_slug ON perlcode.page_views(slug);
```

---

## 4. File Structure

```
perlcode/
├── frontend/                    # Astro static site
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatWidget.tsx   # Preact island (only JS on page)
│   │   │   ├── SearchBox.tsx    # Pagefind trigger
│   │   │   ├── CodeBlock.astro  # Syntax highlighted code
│   │   │   ├── Header.astro
│   │   │   └── Footer.astro
│   │   ├── layouts/
│   │   │   ├── Base.astro       # HTML shell
│   │   │   └── Question.astro   # Q&A page layout
│   │   ├── pages/
│   │   │   ├── index.astro
│   │   │   ├── questions/
│   │   │   │   └── [slug].astro
│   │   │   ├── topics/
│   │   │   │   └── [topic].astro
│   │   │   └── api/             # API routes (SSR disabled)
│   │   └── styles/
│   │       └── global.css
│   ├── public/
│   │   └── favicon.svg
│   ├── astro.config.mjs
│   ├── tailwind.config.mjs
│   └── package.json
│
├── api/                         # Bun + Hono API proxy (VPS)
│   ├── src/
│   │   ├── index.ts             # Entry point
│   │   ├── routes/
│   │   │   ├── chat.ts          # AI chat endpoint
│   │   │   ├── search.ts        # Vector search
│   │   │   └── analytics.ts     # Page view tracking
│   │   ├── middleware/
│   │   │   └── rateLimit.ts     # IP-based rate limiting
│   │   └── lib/
│   │       ├── vectorengine.ts  # VectorEngine API client
│   │       └── supabase.ts      # Database client
│   ├── Dockerfile
│   └── package.json
│
├── scripts/                     # Content generation
│   ├── import-paa.ts            # Import PAA CSV data
│   ├── import-keywords.ts       # Import SEO keywords
│   ├── generate-answers.ts      # AI answer generation
│   ├── generate-embeddings.ts   # Create embeddings for RAG
│   └── export-for-build.ts      # Export JSON for Astro build
│
├── data/
│   ├── google-paa-perl-*.csv    # Source PAA data
│   ├── perl.org-organic.*.csv   # SEO keywords
│   └── questions.json           # Exported for build
│
├── docs/
│   └── genesis/                 # This directory
│
├── docker-compose.yml           # API deployment
├── Makefile                     # Common commands
└── README.md
```

---

## 5. Trade-offs Accepted

### Chose Simplicity Over Performance

| Decision                       | Trade-off                       | Mitigation                   |
| ------------------------------ | ------------------------------- | ---------------------------- |
| VPS API proxy vs Workers       | Higher latency (~50ms vs ~10ms) | Acceptable for chat use case |
| Simple DB schema vs RAG chunks | Less optimal retrieval          | Can add chunks table in V2   |
| No Cloudflare KV cache         | More DB queries                 | Supabase handles load fine   |

### Chose Performance Over Simplicity

| Decision                  | Trade-off                         | Mitigation                  |
| ------------------------- | --------------------------------- | --------------------------- |
| Pagefind vs server search | Larger initial download (~100KB)  | Only loads on search focus  |
| Preact vs vanilla JS      | Framework overhead                | 3KB is negligible           |
| Pre-rendered HTML         | Build time increases with content | Incremental builds in Astro |

### Deferred to V2

- User authentication
- Code playground (WebPerl)
- Module encyclopedia
- Community contributions
- Enterprise features

---

## 6. Phase 1 Action Plan (MVP)

### Week 1: Foundation

1. **Set up database schema**
   - Run SQL migration on Supabase
   - Verify pgvector extension enabled
   - Test connections from local

2. **Create Astro project**
   - Initialize with Tailwind
   - Set up base layout
   - Create question page template

3. **Build API proxy**
   - Bun + Hono setup
   - Rate limiting middleware
   - VectorEngine integration

### Week 2: Content Pipeline

4. **Import data**
   - Parse PAA CSV → database
   - Parse SEO keywords → prioritized list
   - Generate first 100 answers with claude-sonnet

5. **Generate embeddings**
   - Create embeddings for all questions
   - Store in pgvector column
   - Test semantic search

6. **Build export pipeline**
   - Export questions to JSON
   - Astro build consumes JSON
   - Test static generation

### Week 3: Features & Launch

7. **Implement chat widget**
   - Preact component
   - Streaming responses
   - Rate limiting (10/day free)

8. **Implement search**
   - Pagefind integration
   - Command+K shortcut
   - Fallback to chat

9. **Deploy**
   - API to VPS via Docker
   - Frontend to Cloudflare Pages
   - Connect domain (perlcode.dev)

10. **Launch with 500 pages**
    - Monitor indexing
    - Track initial traffic
    - Gather feedback

---

## 7. Phase 2 Roadmap

### Month 2-3: Content Scale

- Generate remaining 2,500+ questions
- Add topic hub pages
- Implement related questions
- Add "Was this helpful?" feedback

### Month 4-6: Enhancements

- Code translator (Perl ↔ Python)
- Regex visualizer
- Function reference pages
- Umami analytics integration

### Month 7-12: Monetization

- Pro tier (unlimited AI, no ads)
- Team tier (API access)
- Enterprise inquiries
- Affiliate partnerships

---

## 8. Key Risks

| Risk                          | Likelihood | Impact | Mitigation                            |
| ----------------------------- | ---------- | ------ | ------------------------------------- |
| AI generates wrong Perl code  | Medium     | High   | RAG context + human review queue      |
| Low search volume             | Low        | High   | Data shows 14K+/mo for "perl" alone   |
| Community rejection           | Medium     | Medium | Open source parts, contribute to CPAN |
| VectorEngine rate limits      | Low        | Medium | Cache responses, batch generation     |
| Cloudflare Pages build limits | Low        | Low    | 500 builds/month free is plenty       |

---

## 9. Decision Points

### Decided

| Question        | Decision         | Rationale                              |
| --------------- | ---------------- | -------------------------------------- |
| Domain          | perlcode.dev     | Clear, memorable, available            |
| Auth            | None for MVP     | Simplicity, rate limit by IP           |
| Raku (Perl 6)   | Separate (later) | Different language, different audience |
| Code playground | V2               | Complex, WebPerl is experimental       |

### To Decide Later

| Question                    | Options             | Decide By |
| --------------------------- | ------------------- | --------- |
| Monetization tier pricing   | $9/$29/$99/mo       | Month 4   |
| Open source strategy        | Full/partial/closed | Month 3   |
| Perl Foundation partnership | Pursue/ignore       | Month 6   |

---

## 10. Success Metrics (90 days)

| Metric           | Target              | Measurement           |
| ---------------- | ------------------- | --------------------- |
| Indexed pages    | 1,000+              | Google Search Console |
| Organic traffic  | 10,000 visits/month | Umami                 |
| Chat queries     | 500/day             | Internal logs         |
| Return visitors  | 20%                 | Umami                 |
| Avg time on page | > 2 minutes         | Umami                 |
| Core Web Vitals  | All green           | PageSpeed Insights    |

---

## 11. Cost Estimate (Monthly)

| Item                  | Cost            |
| --------------------- | --------------- |
| Cloudflare Pages      | $0              |
| VPS (existing)        | $0              |
| Supabase (existing)   | $0              |
| VectorEngine API      | ~$50-100        |
| Domain (perlcode.dev) | ~$1             |
| **Total**             | **~$50-100/mo** |

---

## Confidence Score: 9/10

**Why 9?**

- Architecture is proven (static + API proxy pattern)
- Tech choices are boring and reliable
- Clear separation of concerns
- Data sources already available (3,000+ PAA questions)
- Existing infrastructure (VPS, Supabase) reduces risk
- Simple MVP scope with clear expansion path

**Why not 10?**

- Perl market size uncertainty
- AI accuracy for niche language needs validation
- No user feedback yet

---

_Generated by Diamond Flow Protocol - /meet --new_
_Date: 2025-12-28_
