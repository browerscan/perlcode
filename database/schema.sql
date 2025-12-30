-- PerlCode Knowledge Base - Database Schema
-- Target: Supabase PostgreSQL with pgvector extension
-- Schema: perlcode (isolated from other projects)
--
-- Run with: psql -h supabase-db -U postgres -f schema.sql
-- Or via Supabase Studio SQL Editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create schema
CREATE SCHEMA IF NOT EXISTS perlcode;

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- Questions table (the core content)
-- Each row = one pSEO page
CREATE TABLE IF NOT EXISTS perlcode.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- URL and display
    slug VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,

    -- Content
    question TEXT NOT NULL,
    answer_html TEXT NOT NULL,        -- Pre-rendered HTML for display
    answer_plain TEXT NOT NULL,       -- Plain text for search/AI context

    -- Proof-of-work (code verification loop)
    code_snippet TEXT,                -- Perl code that was executed
    code_stdout TEXT,                 -- Captured STDOUT
    code_stderr TEXT,                 -- Captured STDERR
    code_exit_code INTEGER,
    code_runtime_ms INTEGER,
    perl_version TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,

    -- Categorization
    category VARCHAR(100),
    tags TEXT[] DEFAULT '{}',
    difficulty VARCHAR(20) DEFAULT 'intermediate'
        CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),

    -- Source tracking
    source VARCHAR(50) DEFAULT 'paa',  -- 'paa', 'manual', 'generated'
    source_url TEXT,                   -- Original source URL if any

    -- Search optimization
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(question, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(answer_plain, '')), 'C')
    ) STORED,

    -- RAG embedding (1536 dimensions for OpenAI ada-002 / text-embedding-3-small)
    embedding vector(1536),

    -- Analytics
    view_count INTEGER DEFAULT 0,
    helpful_yes INTEGER DEFAULT 0,
    helpful_no INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ,         -- NULL = draft

    -- Quality flags
    is_reviewed BOOLEAN DEFAULT FALSE,
    review_notes TEXT
);

-- Chat sessions (anonymous, no auth required)
CREATE TABLE IF NOT EXISTS perlcode.chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token VARCHAR(64) UNIQUE NOT NULL,

    -- Rate limiting
    ip_hash VARCHAR(64),              -- SHA256 of IP for privacy

    -- Context
    current_page_slug VARCHAR(255),   -- What page they're viewing

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW(),

    -- Limits
    message_count INTEGER DEFAULT 0,
    daily_message_count INTEGER DEFAULT 0,
    execution_count INTEGER DEFAULT 0,
    daily_execution_count INTEGER DEFAULT 0,
    last_reset_date DATE DEFAULT CURRENT_DATE
);

-- Chat messages
CREATE TABLE IF NOT EXISTS perlcode.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES perlcode.chat_sessions(id) ON DELETE CASCADE,

    -- Message content
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,

    -- AI metadata
    model VARCHAR(100),               -- e.g., 'grok-4-fast-non-reasoning'
    tokens_input INTEGER,
    tokens_output INTEGER,
    latency_ms INTEGER,               -- Response time

    -- Context used
    context_question_ids UUID[],      -- Which questions were used as RAG context

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Code runs (re-executing verified snippets from pages)
CREATE TABLE IF NOT EXISTS perlcode.code_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES perlcode.chat_sessions(id) ON DELETE SET NULL,
    slug VARCHAR(255) NOT NULL,
    code_snippet TEXT NOT NULL,
    stdout TEXT,
    stderr TEXT,
    exit_code INTEGER,
    runtime_ms INTEGER,
    perl_version TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Page views (simple analytics)
CREATE TABLE IF NOT EXISTS perlcode.page_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Page info
    slug VARCHAR(255) NOT NULL,
    path TEXT,                        -- Full path if different from slug

    -- Visitor info (anonymized)
    referrer TEXT,
    user_agent TEXT,
    country VARCHAR(2),               -- ISO country code

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SEO Keywords tracking (from perl.org organic data)
CREATE TABLE IF NOT EXISTS perlcode.seo_keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Keyword data
    keyword VARCHAR(500) NOT NULL,
    search_volume INTEGER,
    keyword_difficulty INTEGER,
    cpc DECIMAL(10,2),

    -- Current ranking
    current_position INTEGER,
    current_url TEXT,
    traffic_estimate INTEGER,

    -- Our coverage
    question_id UUID REFERENCES perlcode.questions(id) ON DELETE SET NULL,
    target_priority VARCHAR(20) DEFAULT 'medium'
        CHECK (target_priority IN ('high', 'medium', 'low', 'ignore')),

    -- Timestamps
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- IDEMPOTENT COLUMN ADDS (for existing DBs)
-- =============================================================================

ALTER TABLE perlcode.questions
    ADD COLUMN IF NOT EXISTS code_snippet TEXT,
    ADD COLUMN IF NOT EXISTS code_stdout TEXT,
    ADD COLUMN IF NOT EXISTS code_stderr TEXT,
    ADD COLUMN IF NOT EXISTS code_exit_code INTEGER,
    ADD COLUMN IF NOT EXISTS code_runtime_ms INTEGER,
    ADD COLUMN IF NOT EXISTS perl_version TEXT,
    ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE perlcode.chat_sessions
    ADD COLUMN IF NOT EXISTS execution_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS daily_execution_count INTEGER DEFAULT 0;

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Questions indexes
CREATE INDEX IF NOT EXISTS idx_questions_slug ON perlcode.questions(slug);
CREATE INDEX IF NOT EXISTS idx_questions_category ON perlcode.questions(category);
CREATE INDEX IF NOT EXISTS idx_questions_tags ON perlcode.questions USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_questions_search ON perlcode.questions USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_questions_published ON perlcode.questions(published_at) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_questions_source ON perlcode.questions(source);

-- Vector index for RAG (IVFFlat - good balance of speed/accuracy)
-- Note: Requires at least 100 rows before this index becomes effective
CREATE INDEX IF NOT EXISTS idx_questions_embedding ON perlcode.questions
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Trigram index for fuzzy title search
CREATE INDEX IF NOT EXISTS idx_questions_title_trgm ON perlcode.questions
    USING GIN(title gin_trgm_ops);

-- Chat indexes
CREATE INDEX IF NOT EXISTS idx_chat_sessions_token ON perlcode.chat_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_ip ON perlcode.chat_sessions(ip_hash);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON perlcode.chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON perlcode.chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_code_runs_session ON perlcode.code_runs(session_id);
CREATE INDEX IF NOT EXISTS idx_code_runs_slug ON perlcode.code_runs(slug);
CREATE INDEX IF NOT EXISTS idx_code_runs_created ON perlcode.code_runs(created_at);

-- Analytics indexes
CREATE INDEX IF NOT EXISTS idx_page_views_slug ON perlcode.page_views(slug);
CREATE INDEX IF NOT EXISTS idx_page_views_created ON perlcode.page_views(created_at);
-- Avoid expression index on timestamptz->date (timezone-dependent, not immutable)

-- SEO indexes
CREATE INDEX IF NOT EXISTS idx_seo_keywords_keyword ON perlcode.seo_keywords(keyword);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_priority ON perlcode.seo_keywords(target_priority);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_volume ON perlcode.seo_keywords(search_volume DESC);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update timestamp function
CREATE OR REPLACE FUNCTION perlcode.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to questions table
DROP TRIGGER IF EXISTS update_questions_timestamp ON perlcode.questions;
CREATE TRIGGER update_questions_timestamp
    BEFORE UPDATE ON perlcode.questions
    FOR EACH ROW
    EXECUTE FUNCTION perlcode.update_timestamp();

-- Apply to seo_keywords table
DROP TRIGGER IF EXISTS update_seo_keywords_timestamp ON perlcode.seo_keywords;
CREATE TRIGGER update_seo_keywords_timestamp
    BEFORE UPDATE ON perlcode.seo_keywords
    FOR EACH ROW
    EXECUTE FUNCTION perlcode.update_timestamp();

-- Auto-increment view count function
CREATE OR REPLACE FUNCTION perlcode.increment_view_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE perlcode.questions
    SET view_count = view_count + 1
    WHERE slug = NEW.slug;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on page_views insert
DROP TRIGGER IF EXISTS increment_question_views ON perlcode.page_views;
CREATE TRIGGER increment_question_views
    AFTER INSERT ON perlcode.page_views
    FOR EACH ROW
    EXECUTE FUNCTION perlcode.increment_view_count();

-- =============================================================================
-- PERMISSIONS
-- =============================================================================

-- Compatibility: Supabase has roles (anon/authenticated/service_role). Plain Postgres may not.
DO $$
DECLARE
    r TEXT;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('CREATE ROLE %I NOLOGIN', r);
        END IF;
    END LOOP;
EXCEPTION
    WHEN insufficient_privilege THEN
        -- Ignore if running without privileges to create roles
        NULL;
END $$;

DO $$
DECLARE
    r TEXT;
BEGIN
    FOREACH r IN ARRAY ARRAY['postgres', 'anon', 'authenticated', 'service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('GRANT USAGE ON SCHEMA perlcode TO %I', r);
            EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA perlcode TO %I', r);
            EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA perlcode TO %I', r);
            EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA perlcode TO %I', r);
        END IF;
    END LOOP;
END $$;

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Semantic search function using embeddings
CREATE OR REPLACE FUNCTION perlcode.search_questions_semantic(
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    slug VARCHAR(255),
    title VARCHAR(500),
    question TEXT,
    answer_plain TEXT,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        q.id,
        q.slug,
        q.title,
        q.question,
        q.answer_plain,
        1 - (q.embedding <=> query_embedding) AS similarity
    FROM perlcode.questions q
    WHERE
        q.embedding IS NOT NULL
        AND q.published_at IS NOT NULL
        AND 1 - (q.embedding <=> query_embedding) > match_threshold
    ORDER BY q.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Full-text search function
CREATE OR REPLACE FUNCTION perlcode.search_questions_fulltext(
    search_query TEXT,
    result_limit INT DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    slug VARCHAR(255),
    title VARCHAR(500),
    question TEXT,
    rank FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        q.id,
        q.slug,
        q.title,
        q.question,
        ts_rank(q.search_vector, websearch_to_tsquery('english', search_query)) AS rank
    FROM perlcode.questions q
    WHERE
        q.search_vector @@ websearch_to_tsquery('english', search_query)
        AND q.published_at IS NOT NULL
    ORDER BY rank DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- Reset daily chat limits (run via cron)
CREATE OR REPLACE FUNCTION perlcode.reset_daily_chat_limits()
RETURNS void AS $$
BEGIN
    UPDATE perlcode.chat_sessions
    SET
        daily_message_count = 0,
        daily_execution_count = 0,
        last_reset_date = CURRENT_DATE
    WHERE last_reset_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SEED DATA
-- =============================================================================
-- Intentionally omitted from migrations.
-- For local-only sample content, run: `make db-seed` (uses `database/seed.dev.sql`).

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- Check all objects created
DO $$
BEGIN
    RAISE NOTICE 'Schema perlcode created successfully';
    RAISE NOTICE 'Tables: questions, chat_sessions, chat_messages, page_views, seo_keywords';
    RAISE NOTICE 'Functions: search_questions_semantic, search_questions_fulltext, reset_daily_chat_limits';
    RAISE NOTICE 'Ready for data import!';
END $$;
