# Repository Guidelines

## Project Structure & Module Organization

- `frontend/`: Astro static site. Pages in `frontend/src/pages/`, layouts in `frontend/src/layouts/`, islands in `frontend/src/components/`, and static assets in `frontend/public/` (including WebPerl under `frontend/public/webperl/`).
- `api/`: Bun + Hono API. Entry point `api/src/index.ts`; routes in `api/src/routes/`.
- `scripts/`: Content + SEO pipeline (Bun-run TypeScript).
- `database/`: Idempotent schema in `database/schema.sql`; local-only seed in `database/seed.dev.sql`.
- `data/`: Source CSV inputs/exports (treat as artifacts; avoid committing new dumps unless intentional).
- `docs/`: Product/architecture notes and runbooks.

## Build, Test, and Development Commands

- `make dev`: Runs the Astro dev server and the API in watch mode.
- `make build`: Installs frontend deps and produces a production build.
- `make validate`: Validates `docker-compose.yml` (use before deploy).
- `make deploy`: Builds and starts the API container via Docker Compose.
- `make import` / `make generate` / `make embeddings` / `make export`: Run the data pipeline steps from `scripts/`.
- `make publish`: Gradually flips verified rows to `published_at` (SEO-safe rollout).
- `make db-migrate`: Applies `database/schema.sql` using `psql` (requires DB connectivity).
- `make db-seed`: Inserts a verified+published sample page if none exist (dev only).

## Coding Style & Naming Conventions

- TypeScript is ESM (`"type": "module"`). Prefer 2-space indentation and keep the existing quoting/style per area (`api/` tends to use double quotes + semicolons).
- Keep routes REST-like under `api/src/routes/` and name files by feature (`search.ts`, `chat.ts`).
- Frontend: keep pages in `frontend/src/pages/` and reusable UI in `frontend/src/components/`. Prefer Tailwind utility classes over custom CSS unless necessary.

## Testing Guidelines

- `cd scripts && bun test` (pipeline unit tests)
- `cd api && bun --env-file=../.env test` (API route tests; requires local DB + Docker)
- `cd frontend && bun run check && bun run build` (Astro/TS validation + static build)
- Smoke test API: `curl http://localhost:3000/` should return JSON `{ "status": "ok", ... }` when `make dev` is running.

## Commit & Pull Request Guidelines

- Follow Conventional Commits (e.g., `feat(api): add rate limit`, `fix(frontend): correct link`).
- PRs should include: summary, local verification steps, and (for UI changes) screenshots. Call out any schema changes and required `make db-migrate` steps.

## Security & Configuration Tips

- Copy `.env.example` to `.env` and keep secrets out of source control (DB password, VectorEngine token).
- Local DB runs via Docker Compose (`db` service with pgvector). Ensure `DATABASE_URL` points to `localhost` for host-run dev, or use `DATABASE_URL_DOCKER` when running the API container.
