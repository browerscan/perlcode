# PerlCode - The AI that actually understands Perl

An AI-native knowledge base for Perl developers with 3,000+ Q&A pages and an intelligent chat interface.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) runtime
- Docker & Docker Compose
- PostgreSQL (provided via `docker compose` in this repo)

### Development

```bash
# Install dependencies
cd frontend && bun install
cd ../api && bun install
cd ../scripts && bun install

# Copy environment variables
cp .env.example .env
# Edit .env with your credentials

# Run database migration
make db-migrate

# (Optional) Seed a verified+published sample page for local dev
make db-seed

# Import PAA data
make import

# Generate AI answers (batch of 10)
cd scripts && bun run generate-answers.ts 10

# Generate embeddings for RAG
make embeddings

# Publish a small batch (SEO-safe rollout)
make publish

# Export JSON for Astro build
make export

# Start development servers
make dev
```

### Production Deployment

```bash
# Build frontend
make build

# Deploy to Cloudflare Pages
# (via GitHub Actions or wrangler)

# Deploy API to VPS
make deploy
```

## Architecture

```
Frontend (Astro)          API (Bun + Hono)
    │                          │
    │  Cloudflare Pages        │  VPS Docker
    │                          │
    └──────────┬───────────────┘
               │
      PostgreSQL + pgvector
        (perlcode schema)
```

## Project Structure

```
perlcode/
├── frontend/          # Astro static site
├── api/               # Bun + Hono API proxy
├── scripts/           # Data pipeline scripts
├── database/          # SQL migrations
├── data/              # Source CSV files
└── docs/              # Documentation
```

## Key Features

- **pSEO Pages**: 3,000+ auto-generated Q&A pages from Google PAA data
- **Verification Loop**: Perl snippets are executed in a Docker sandbox; pages ship with real STDOUT/STDERR (“proof of work”)
- **SEO-Safe Rollout**: Draft pages render `noindex`; only verified + published pages enter the sitemap
- **AI Chat**: RAG-powered chat widget with streaming responses
- **Search**: Client-side search with Pagefind
- **Playground**: Run snippets in-browser (WebPerl) and re-run published snippets on the server (`/api/execute`)
- **Rate Limiting**: Daily limits for chat and code execution

## Tech Stack

| Layer    | Technology                 |
| -------- | -------------------------- |
| Frontend | Astro, Preact, Tailwind    |
| API      | Bun, Hono                  |
| Database | PostgreSQL, pgvector       |
| AI       | VectorEngine (grok-4-fast) |
| Hosting  | Cloudflare Pages, VPS      |

## Data Pipeline

1. **Import**: PAA CSV → Database
2. **Generate**: AI answers using claude-sonnet
3. **Embed**: Create vectors for RAG
4. **Export**: JSON for Astro build
5. **Build**: Static site generation

## License

Proprietary
