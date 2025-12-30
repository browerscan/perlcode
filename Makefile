.PHONY: help dev build deploy down logs validate db-up db-wait db-psql db-migrate db-seed db-backup

POSTGRES_DB ?= perlcode
POSTGRES_USER ?= postgres
ENV_FILE ?= .env
BUN_TMPDIR ?= $(PWD)/.tmp
BUN_CACHE ?= $(PWD)/.bun-cache
BUN := TMPDIR=$(BUN_TMPDIR) BUN_INSTALL_CACHE_DIR=$(BUN_CACHE) bun

help:
	@echo "PerlCode - Available commands:"
	@echo "  make dev        - Run frontend and API in development mode"
	@echo "  make build      - Build frontend for production"
	@echo "  make deploy     - Start API+DB via Docker Compose (prod profile)"
	@echo "  make down       - Stop API containers"
	@echo "  make logs       - View API logs"
	@echo "  make validate   - Validate docker-compose config"
	@echo "  make import     - Import PAA data to database"
	@echo "  make generate   - Generate AI answers for questions"
	@echo "  make embeddings - Generate embeddings for RAG"
	@echo "  make export     - Export published questions for Astro build"
	@echo "  make publish    - Publish verified pages gradually"
	@echo "  make db-up      - Start local Postgres (pgvector)"
	@echo "  make db-migrate - Apply database/schema.sql (idempotent)"
	@echo "  make db-seed    - Insert local sample data (dev only)"
	@echo "  make db-psql    - Open psql shell inside the DB container"

# Development
dev: db-up
	@echo "Starting development servers..."
	@mkdir -p $(BUN_TMPDIR) $(BUN_CACHE)
	@cd frontend && $(BUN) run --env-file=../$(ENV_FILE) dev &
	@cd api && $(BUN) run --env-file=../$(ENV_FILE) dev

# Build
build:
	@echo "Building frontend..."
	@mkdir -p $(BUN_TMPDIR) $(BUN_CACHE)
	@cd frontend && $(BUN) install && $(BUN) run --env-file=../$(ENV_FILE) build

# Deploy API
deploy: validate
	@echo "Deploying API..."
	docker compose --profile prod up -d --build

# Stop containers
down:
	docker compose down

# View logs
logs:
	docker compose logs -f

# Validate config
validate:
	docker compose config --quiet

# Data pipeline
import:
	@echo "Importing PAA data..."
	@mkdir -p $(BUN_TMPDIR) $(BUN_CACHE)
	@cd scripts && $(BUN) run --env-file=../$(ENV_FILE) import-paa.ts

generate:
	@echo "Generating AI answers..."
	@mkdir -p $(BUN_TMPDIR) $(BUN_CACHE)
	@cd scripts && $(BUN) run --env-file=../$(ENV_FILE) generate-answers.ts

embeddings:
	@echo "Generating embeddings..."
	@mkdir -p $(BUN_TMPDIR) $(BUN_CACHE)
	@cd scripts && $(BUN) run --env-file=../$(ENV_FILE) generate-embeddings.ts

export:
	@echo "Exporting questions for build..."
	@mkdir -p $(BUN_TMPDIR) $(BUN_CACHE)
	@cd scripts && $(BUN) run --env-file=../$(ENV_FILE) export-for-build.ts

publish:
	@echo "Publishing verified pages..."
	@mkdir -p $(BUN_TMPDIR) $(BUN_CACHE)
	@cd scripts && $(BUN) run --env-file=../$(ENV_FILE) publish.ts

# Database
db-up:
	@docker compose up -d db

db-wait: db-up
	@echo "Waiting for database..."
	@docker compose exec -T db sh -lc 'until pg_isready -U "$(POSTGRES_USER)" -d "$(POSTGRES_DB)" >/dev/null 2>&1; do sleep 1; done'

db-psql: db-up
	@docker compose exec db psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

db-migrate: db-wait
	@echo "Applying database/schema.sql (idempotent)..."
	@docker compose exec -T db psql -U $(POSTGRES_USER) -d $(POSTGRES_DB) < database/schema.sql

db-seed: db-wait
	@echo "Seeding local dev data (database/seed.dev.sql)..."
	@docker compose exec -T db psql -U $(POSTGRES_USER) -d $(POSTGRES_DB) < database/seed.dev.sql

db-backup:
	@echo "Backing up database..."
	@docker compose exec -T db pg_dump -U $(POSTGRES_USER) -n perlcode $(POSTGRES_DB) > backup-$(shell date +%Y%m%d).sql
