# SEO Rollout Plan (Verified-Only Indexing)

The March 2024 Google core/spam updates heavily penalize mass-published, low-evidence AI pages. PerlCode ships with a hard quality gate: only pages with _proof-of-work_ (sandbox execution results) are allowed to index.

## States

1. **Draft**: `published_at IS NULL`
   - Page exists (SSG), but renders `robots=noindex,follow`.
2. **Verified**: `is_verified = true`
   - The snippet executed successfully and we stored: `code_snippet`, `code_stdout`, `code_stderr`, `code_exit_code`, `code_runtime_ms`, `perl_version`.
3. **Indexable**: `is_verified = true AND published_at IS NOT NULL`
   - Included in `frontend/src/pages/sitemap.xml.ts`.

## Rollout Mechanics

- Run `scripts/publish.ts` on a schedule (e.g. cron) to publish _small batches_ of verified pages.
- Prioritize topic hubs first: topic pages include only categories with indexable content and help concentrate internal linking.

## Operational Checklist

- Don’t publish all pages at once; ramp gradually (daily/weekly).
- Monitor:
  - Search Console indexing coverage + crawl stats
  - log volume on `/api/chat` and `/api/execute`
  - DB growth (`code_runs`, `page_views`)
