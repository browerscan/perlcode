# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PerlCode is an AI-native knowledge base for Perl developers with 3,000+ Q&A pages and an intelligent RAG-powered chat interface. Each Q&A page includes a verified code snippet with actual STDOUT/STDERR output ("proof of work").

## Commands

```bash
# Development
make dev              # Start frontend (Astro) + API (Hono) in dev mode
make build            # Build frontend for production

# Data Pipeline (run in order for initial setup)
make db-migrate       # Apply schema.sql (idempotent)
make import           # Import PAA CSV → database
make embeddings       # Generate RAG embeddings
make publish          # Mark verified pages as published
make export           # Export JSON for Astro build

# Database
make db-up            # Start local Postgres (pgvector)
make db-psql          # Open psql shell
make db-seed          # Insert dev sample data

# Production
make deploy           # Docker Compose (prod profile)
make down             # Stop containers
make logs             # View logs
```

## Architecture

```
Frontend (Astro/Preact)     API (Bun/Hono)
     │                           │
     │  Cloudflare Pages         │  VPS Docker
     │                           │
     └───────────┬───────────────┘
                 │
        PostgreSQL + pgvector
          (perlcode schema)
```

Three distinct codebases share the database:

- **frontend/**: Astro static site (Preact components, Tailwind, Pagefind search)
- **api/**: Bun + Hono REST API (chat streaming, code execution, analytics)
- **scripts/**: Data pipeline scripts (import, generate-answers, embeddings, export)

## Key Technical Details

**Database**: PostgreSQL with `pgvector` extension, all tables in `perlcode` schema. Uses 1536-dimension embeddings (text-embedding-3-small).

**AI Integration**: VectorEngine API (OpenAI-compatible) at `api.vectorengine.app/v1`. Chat uses `grok-4-fast-non-reasoning`, embeddings use `text-embedding-3-small`.

**Content Pipeline**:

1. PAA CSV data imported to `perlcode.questions`
2. AI generates answers with code snippets
3. Code verified in Docker sandbox (Perl execution)
4. Embeddings generated for RAG search
5. Pages published (only verified+published enter sitemap)
6. JSON export consumed by Astro build

**Rate Limiting**: 10 daily chat messages per session, tracked via hashed IP.

## Environment Variables

Required in `.env`:

- `DATABASE_URL` - Postgres connection string
- `VECTORENGINE_TOKEN` - API key for chat/embeddings
- `PUBLIC_API_URL` - Frontend → API endpoint

## File Locations

- `database/schema.sql` - Full schema with functions and indexes
- `data/` - Source CSV files (PAA, keywords)
- `frontend/public/webperl/` - WebPerl WASM for in-browser Perl execution
