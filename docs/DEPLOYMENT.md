# Deployment (VPS + Cloudflare Pages)

## Frontend (Cloudflare Pages)

- Build from `frontend/` (Astro static output).
- Configure `PUBLIC_API_URL` to your API base (e.g. `https://api.perlcode.dev`).

## Backend + Database (VPS Docker)

**Path constraint:** run the API + DB stack from:

`/opt/docker-projects/heavy-tasks/perlcode` (server)  
`/Volumes/SSD/skills/server-ops/vps/107.174.42.198/heavy-tasks/perlcode` (local mirror)

### Local mirror sync (optional)

- Use `tooling/sync-to-heavy-tasks.sh` to keep the local mirror updated:
  - `tooling/sync-to-heavy-tasks.sh`

### Bring-up (first time)

1. Copy `.env.example` → `.env` and set strong secrets (`POSTGRES_PASSWORD`, `VECTORENGINE_TOKEN`).
2. Start DB + apply schema:
   - `make db-migrate`
3. Start the API container:
   - `make deploy`

### Reverse proxy

- Prefer binding containers to `127.0.0.1` (default via `POSTGRES_BIND_IP` / `API_BIND_IP`) and expose them through your reverse proxy (nginx/Caddy).

### Operations

- Backup schema data: `make db-backup`
- Gradual SEO rollout (cron): run `make publish` daily/weekly to publish small verified batches.
