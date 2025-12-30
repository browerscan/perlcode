# Perl Knowledge Base - GOD OF SIMPLICITY Architecture

> Note (2025-12-29): This doc is historical. Current implementation: `docs/ARCHITECTURE.md` (VPS Docker Postgres+pgvector + Bun/Hono API, verified-only indexing).

## Overview

A pSEO site with 3,000+ Perl Q&A pages and an AI chat widget. Static frontend on Cloudflare Pages, API proxy on VPS, data in Supabase PostgreSQL.

---

## 1. Tech Stack

| Layer       | Choice                         | Why                                          |
| ----------- | ------------------------------ | -------------------------------------------- |
| Frontend    | Astro (static)                 | Zero JS by default, MDX support, fast builds |
| Hosting     | Cloudflare Pages               | Free, global CDN, simple deploys             |
| Database    | Supabase PostgreSQL            | Already on VPS, pgvector built-in            |
| API Proxy   | Bun + Hono                     | Single file, fast, TypeScript                |
| AI Chat     | VectorEngine API               | RAG built-in, no infra needed                |
| Content Gen | Claude Sonnet via VectorEngine | Batch generation scripts                     |

**Why Astro over Next.js?**

- No server needed for 3,000 static pages
- Faster builds, smaller output
- MDX for content, islands for chat widget only

---

## 2. Database Design

Single schema, four tables. That's it.

```sql
-- Schema: perlcode
CREATE SCHEMA IF NOT EXISTS perlcode;

-- Questions table (the core content)
CREATE TABLE IF NOT EXISTS perlcode.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    category VARCHAR(100),
    tags TEXT[],
    difficulty VARCHAR(20) DEFAULT 'intermediate',
    view_count INTEGER DEFAULT 0,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat sessions (anonymous, no auth)
CREATE TABLE IF NOT EXISTS perlcode.chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages
CREATE TABLE IF NOT EXISTS perlcode.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES perlcode.chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analytics (simple page views)
CREATE TABLE IF NOT EXISTS perlcode.page_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(255) NOT NULL,
    referrer TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_questions_slug ON perlcode.questions(slug);
CREATE INDEX IF NOT EXISTS idx_questions_category ON perlcode.questions(category);
CREATE INDEX IF NOT EXISTS idx_questions_embedding ON perlcode.questions USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON perlcode.chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_page_views_created ON perlcode.page_views(created_at);
```

---

## 3. File Structure

```
perlcode/
├── frontend/                    # Astro static site
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatWidget.tsx   # React island (only JS on page)
│   │   │   ├── Header.astro
│   │   │   └── Footer.astro
│   │   ├── layouts/
│   │   │   └── Base.astro
│   │   ├── pages/
│   │   │   ├── index.astro
│   │   │   ├── questions/
│   │   │   │   └── [slug].astro
│   │   │   └── categories/
│   │   │       └── [category].astro
│   │   └── styles/
│   │       └── global.css
│   ├── astro.config.mjs
│   └── package.json
│
├── api/                         # Bun + Hono API proxy
│   ├── src/
│   │   ├── index.ts
│   │   └── routes/
│   │       ├── chat.ts
│   │       └── analytics.ts
│   ├── Dockerfile
│   └── package.json
│
├── scripts/                     # Content generation
│   ├── generate-questions.ts
│   ├── generate-embeddings.ts
│   └── export-for-build.ts
│
├── data/
│   └── questions.json
│
├── docker-compose.yml
├── Makefile
└── README.md
```

**Total: ~15 files that matter.**

---

## 4. Deployment

### Frontend (Cloudflare Pages)

- GitHub Actions on push to main
- Auto-build with Astro
- Free tier handles 3K pages

### API (VPS)

- SSH deploy via GitHub Actions
- Docker compose with existing networks
- Uses nginx-proxy_default and supabase_default

---

## 5. Development Workflow

```bash
# Frontend
cd frontend && bun run dev  # http://localhost:4321

# API
cd api && bun run dev       # http://localhost:3000

# Content generation
cd scripts && bun run generate-questions.ts
```

---

## 6. Cost Estimate (Monthly)

| Item             | Cost            |
| ---------------- | --------------- |
| Cloudflare Pages | $0              |
| VPS (existing)   | $0              |
| VectorEngine API | ~$50-100        |
| **Total**        | **~$50-100/mo** |

---

## 7. Timeline to MVP

| Phase  | Duration                                |
| ------ | --------------------------------------- |
| Week 1 | DB schema, API proxy, basic frontend    |
| Week 2 | Chat widget, content generation scripts |
| Week 3 | Generate 500 questions, deploy, test    |
| Week 4 | Polish, SEO, launch                     |

**MVP: 3 weeks** (with 500 questions)

---

## 8. What We Sacrificed for Simplicity

- User accounts (anonymous chat is fine)
- Admin dashboard (use Supabase Studio)
- Real-time updates (static rebuild is fine)
- Complex analytics (Umami already on VPS)

---

## Confidence Score: 8/10

**Why 8?**

- Architecture is proven (static + API proxy pattern)
- Tech choices are boring and reliable
- Clear separation of concerns
- Easy to understand and maintain
