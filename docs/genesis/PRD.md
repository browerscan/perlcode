# PerlCode Knowledge Base - Product Requirements Document

> Note (2025-12-29): The current implementation uses self-hosted Postgres (pgvector) + Bun/Hono on VPS and ships a verified-only indexing gate. See `docs/ARCHITECTURE.md` and `docs/SEO_ROLLOUT.md` for the live plan.

## 1. Executive Summary

PerlCode is an AI-native knowledge base for Perl developers, designed to serve the underserved market of legacy Perl maintainers and practitioners. Unlike existing resources (perldoc, PerlMonks, Stack Overflow), PerlCode combines modern UX, RAG-powered AI assistance, and programmatic SEO to become the definitive resource for Perl programming questions. The platform targets organic traffic through 3,000+ SEO-optimized question pages while providing an intelligent chat interface that delivers accurate, grounded answers.

**Tagline:** "The AI that actually understands Perl"

---

## 2. Target Users

### Primary: The Legacy Maintainer

- **Who**: Senior developers (35-55) at enterprises, banks, telecom companies
- **Context**: Inherited 50K-200K+ lines of Perl from 2005-2010. Original authors long gone.
- **Pain**: Documentation is fragmented, Stack Overflow Perl answers are declining, general AI assistants give outdated/wrong Perl advice
- **Jobs to be done**: Quickly understand unfamiliar Perl idioms, modernize legacy code safely, find migration patterns
- **Willingness to pay**: HIGH (employer budget exists)

### Secondary: The Reluctant Learner

- **Who**: DevOps/SRE engineers (25-40) who encounter Perl in scripts/configs
- **Context**: Doesn't want to "learn Perl" - just needs to fix one script
- **Pain**: Perl syntax feels alien after Python/JS, searches return 15-year-old forum posts
- **Jobs to be done**: Quick translation from Python/JS mental model, copy-paste solutions that work
- **Willingness to pay**: MEDIUM

### Tertiary: The Bioinformatics Researcher

- **Who**: Scientists in genomics labs where Perl (BioPerl) is still lingua franca
- **Pain**: Colleagues share undocumented Perl scripts, need domain-specific patterns
- **Jobs to be done**: Parse FASTA/FASTQ files, integrate with modern tools

---

## 3. Core Features (MVP)

### 3.1 pSEO Content Pages

- **Volume**: 3,000+ question pages from Google PAA data
- **URL Structure**:
  - `/questions/{slug}` - Individual Q&A pages
  - `/topics/{topic}` - Hub pages (perl-regex, perl-one-liners, etc.)
  - `/functions/{name}` - Perl function reference
- **Page Template**:
  - Question (H1)
  - AI-generated answer (200-500 words)
  - Code example (syntax highlighted, copy button)
  - Related questions (internal linking)
  - "Was this helpful?" feedback
- **SEO Target**: 10,000+ monthly organic visits within 90 days

### 3.2 AI Chat Widget

- **Position**: Fixed bottom-right corner (like Intercom)
- **Behavior**:
  - No login required for basic usage
  - Rate-limited by IP (10 queries/day free)
  - Context-aware (knows which page user is viewing)
  - Cites sources ("According to perldoc perlre...")
  - Admits uncertainty ("This might vary by Perl version")
- **Backend**: RAG with knowledge base as context → VectorEngine API
- **Model**: grok-4-fast-non-reasoning (fast, cheap, no API key exposure)

### 3.3 Knowledge Base Foundation

- **Content Sources**:
  - 3,000+ PAA questions with AI-generated answers
  - Top 200 Perl functions documented with examples
  - Regex pattern library with visual explanations
  - "In Python, this would be..." comparisons
- **Quality Gate**: Every code example must be syntactically valid

### 3.4 Search

- **Type**: Full-text search with fuzzy matching
- **UX**: Command+K / Ctrl+K shortcut, instant results
- **Fallback**: If no match, prompt AI chat

---

## 4. Success Metrics (90-day MVP)

| Metric            | Target              |
| ----------------- | ------------------- |
| Indexed pages     | 1,000+              |
| Organic traffic   | 10,000 visits/month |
| Chat queries      | 500/day             |
| Return visitors   | 20%                 |
| Avg. time on page | > 2 minutes         |

---

## 5. Extended Features (V2 Roadmap)

### 5.1 Code Translator

- Perl → Python (most requested)
- Perl → Modern Perl (5.10+ features)
- "Explain this regex in English"

### 5.2 Legacy Code Analyzer

- Upload Perl file → Get modernization suggestions
- Security audit (taint mode, injection risks)
- Complexity score

### 5.3 Interactive Playground

- Browser-based Perl REPL (WebPerl/WASM)
- Pre-loaded examples from knowledge base
- Share permalinks

### 5.4 Module Encyclopedia

- AI-generated summaries for top 500 CPAN modules
- Side-by-side comparisons (DBI vs DBIx::Class)

### 5.5 Community Features

- User-contributed examples
- "This helped me" voting
- Perl Jobs Board

---

## 6. Technical Constraints

### Must Have

- **No API keys in frontend** - Public project, all sensitive calls via backend
- **Static frontend** - Cloudflare Pages for cost and performance
- **VPS backend + DB** - Bun/Hono API + PostgreSQL (pgvector) via Docker on VPS
- **Execution sandbox** - Perl code must run server-side (Docker) to capture real STDOUT/STDERR
- **Verified-only indexing** - `noindex` by default; only verified + published pages enter the sitemap

### Architecture

- Frontend: Astro (SSG) → Cloudflare Pages
- API: Bun + Hono → VPS (Docker)
- Database: PostgreSQL + pgvector → VPS (Docker)
- AI: VectorEngine API (external; proxied via API to avoid key exposure)
- CDN: Cloudflare (Pages)

---

## 7. Competitive Positioning

| Competitor       | Strength                | Weakness       | Our Angle            |
| ---------------- | ----------------------- | -------------- | -------------------- |
| perldoc.perl.org | Official, comprehensive | Dense, no AI   | Modern UX + AI       |
| PerlMonks        | Deep community          | Dated UI       | Curated + searchable |
| Stack Overflow   | Volume                  | Perl declining | Perl-focused         |
| ChatGPT/Claude   | Convenient              | Hallucinations | RAG = grounded       |

**Unfair Advantage**: By building 10,000+ verified Perl Q&A pairs with working code examples, we create the most comprehensive Perl-specific dataset. That's a moat.

---

## 8. Monetization (Future)

### Phase 1: Traffic (Month 1-6)

- Programmatic ads (Carbon/BuySellAds): $2-5 CPM
- Affiliate (O'Reilly books, hosting): $50-200/conversion

### Phase 2: Freemium (Month 6-12)

| Tier | Price  | Features                       |
| ---- | ------ | ------------------------------ |
| Free | $0     | 10 AI queries/day, all content |
| Pro  | $9/mo  | Unlimited AI, code translator  |
| Team | $49/mo | API access, private KB         |

### Phase 3: Enterprise (Month 12+)

- Legacy audit packages: $2,500+
- Custom training on internal codebase
- SLA support

---

## 9. Open Questions

1. **Raku (Perl 6)**: Separate site or integrated?
2. **Code playground**: Build (WebPerl) or skip for MVP?
3. **Community contributions**: Allow from day 1 or curate first?
4. **Domain**: perlcode.dev? askperl.dev? perlbrain.com?

---

## 10. Next Steps

1. Finalize architecture (Arena mode synthesis)
2. Design database schema
3. Set up project structure
4. Implement data pipeline for PAA → content generation
5. Build frontend with first 100 pages
6. Implement AI chat widget
7. Deploy and measure organic traction
