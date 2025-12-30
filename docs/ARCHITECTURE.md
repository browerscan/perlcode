# Architecture (Current)

PerlCode is a static-first Perl knowledge base where _only verified content_ is allowed to index. “Verified” means the page’s primary Perl snippet was executed in a locked-down sandbox and the real output was stored.

## Runtime Components

- **Frontend**: `frontend/` (Astro + Tailwind + small Preact islands) → deploy to **Cloudflare Pages**.
- **Backend API**: `api/` (Bun + Hono) → run on **VPS (Docker)**.
  - `POST /api/chat`: VectorEngine proxy (streaming)
  - `GET /api/search`: Postgres full-text search
  - `POST /api/execute`: re-run _published + verified_ snippets in a Docker sandbox (rate limited)
- **Database**: `db` service in `docker-compose.yml` (PostgreSQL + **pgvector**) → VPS/local Docker.
- **Code Sandbox**: Docker `perl:*` images, `--network none`, read-only FS, tmpfs, CPU/memory/time limits.
- **Embeddings/LLM**: VectorEngine (external API).

## Content + SEO Pipeline (Build Time)

1. `scripts/import-paa.ts` → ingest PAA CSV into `perlcode.questions`.
2. `scripts/generate-answers.ts` → generate `answer_html` + extract Perl code → execute → retry/fix up to 3 times.
3. `scripts/generate-embeddings.ts` → write `embedding` for RAG.
4. `scripts/publish.ts` → **gradual rollout**: set `published_at` for a small batch of verified rows per run.
5. `scripts/export-for-build.ts` → export JSON into `frontend/src/generated/` for Astro SSG.

## Indexing Rules (“SEO Safe”)

- Page is **indexable** only when: `is_verified = true` **and** `published_at IS NOT NULL`.
- Non-indexable pages render `robots=noindex,follow` and are excluded from `sitemap.xml`.
