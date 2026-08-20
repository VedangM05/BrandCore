-- Database schema for BrandCore Auth & User Management module

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    parent_id UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);

-- Database schema for BrandCore Crawler module
CREATE TABLE IF NOT EXISTS crawl_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    pages_crawled INTEGER DEFAULT 0,
    error_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crawl_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES crawl_jobs(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    url VARCHAR(2048) UNIQUE NOT NULL,
    title VARCHAR(255),
    meta_description TEXT,
    markdown_content TEXT,
    logo_url VARCHAR(2048),
    colors VARCHAR(50)[],
    font_pairings VARCHAR(255),
    tone TEXT,
    dom_hierarchy JSONB,
    tagline VARCHAR(255),
    mission TEXT,
    audience TEXT,
    value_proposition TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_domain ON crawl_jobs(domain);
CREATE INDEX IF NOT EXISTS idx_crawl_results_domain ON crawl_results(domain);
CREATE INDEX IF NOT EXISTS idx_crawl_results_url ON crawl_results(url);

-- Alter crawl_results to add DNA columns if they do not exist
ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS logo_url VARCHAR(2048);
ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS colors VARCHAR(50)[];
ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS font_pairings VARCHAR(255);
ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS tone TEXT;
ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS dom_hierarchy JSONB;
ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS tagline VARCHAR(255);
ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS mission TEXT;
ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS audience TEXT;
ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS value_proposition TEXT;
-- Candidate real product/hero images found on the site during the crawl
-- (crawl_agent.py's extract_site_images) - [{ url, alt }, ...]. Lets
-- photoshoot.service.ts prefer a real site asset over generating a fake
-- one when the user's request plausibly matches something that already
-- exists.
ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS site_images JSONB;

-- Additional same-domain pages crawled beyond the one URL the user
-- actually scanned (crawl_agent.py's discover_pages_to_crawl - sitemap.xml
-- first, falls back to internal links). Grounds the website Q&A chatbot's
-- knowledge base in the whole site, not just the scanned page - see
-- knowledgeBase.service.ts's indexBrandKnowledge. Replaced (not appended
-- to) on every rescan of the same brand, same "stale content shouldn't
-- linger" pattern the Qdrant re-indexing itself already uses.
CREATE TABLE IF NOT EXISTS crawl_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crawl_result_id UUID NOT NULL REFERENCES crawl_results(id) ON DELETE CASCADE,
    url VARCHAR(2048) NOT NULL,
    markdown_content TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crawl_pages_crawl_result ON crawl_pages(crawl_result_id);

CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_dna_id UUID REFERENCES crawl_results(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    headline VARCHAR(255),
    body_text TEXT,
    social_copy TEXT,
    image_prompt TEXT,
    visual_style VARCHAR(100),
    qa_score INTEGER,
    qa_feedback TEXT,
    attempts INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_brand_dna ON campaigns(brand_dna_id);

-- Database schema additions for Caching & Cost Control module
ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR(50) DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_cost_limit NUMERIC(10, 2) DEFAULT 1.00;
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_token_limit INTEGER DEFAULT 10000;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_cost_usd NUMERIC(10, 6) DEFAULT 0.000000;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_tokens_used INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    endpoint VARCHAR(255) NOT NULL,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0.000000,
    cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
    cache_type VARCHAR(50), -- 'exact', 'semantic', or NULL
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user ON usage_logs(user_id);

-- Database schema additions for Asset Library & History module
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_dna_id UUID REFERENCES crawl_results(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'image', 'copy', 'logo', 'banner'
    file_path VARCHAR(1024) NOT NULL,
    mime_type VARCHAR(100) NOT NULL DEFAULT 'image/png',
    file_size INTEGER NOT NULL DEFAULT 0,
    tags VARCHAR(50)[],
    meta_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_brand_dna ON assets(brand_dna_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type);
CREATE INDEX IF NOT EXISTS idx_assets_tags ON assets USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at);

-- Database schema additions for per-user ownership (multi-tenancy fix)
-- Previously crawl_results/crawl_jobs/campaigns/assets had no owner column at
-- all: any authenticated user could read, edit, or generate against any
-- other user's scanned brand or generated assets by guessing/enumerating a
-- UUID. Every one of these tables gets a nullable user_id (nullable because
-- pre-migration rows have no recorded owner and are intentionally treated as
-- inaccessible going forward - see brandDna.service.ts / asset.service.ts -
-- rather than guessed at or made globally readable).
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_user ON crawl_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_crawl_results_user ON crawl_results(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_user ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id);

-- crawl_results.url was globally UNIQUE, so one user's rescan of a domain
-- another user had already scanned would silently overwrite that user's row
-- (ON CONFLICT (url) DO UPDATE in dna.service.ts). Scope uniqueness to
-- (user_id, url) instead so each user's scan of the same site is independent.
ALTER TABLE crawl_results DROP CONSTRAINT IF EXISTS crawl_results_url_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crawl_results_user_url_key'
  ) THEN
    ALTER TABLE crawl_results ADD CONSTRAINT crawl_results_user_url_key UNIQUE (user_id, url);
  END IF;
END $$;

-- Database schema additions for server-side multi-tenant projects.
-- Previously a "project" (a scanned brand workspace) existed only in the
-- frontend's localStorage, keyed by a client-generated id
-- (`brand-${Date.now()}`) - it never persisted server-side, didn't survive a
-- different browser/device, and every generation call had to fall back to
-- resolving brand identity by URL string instead of a real id (see
-- brandDna.service.ts). This table is the real, server-owned record of "this
-- user scanned this site" - one row per (user_id, url), upserted by
-- dna.service.ts on every scan and linked to its Brand DNA row.
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(2048) NOT NULL,
    domain VARCHAR(255) NOT NULL,
    brand_dna_id UUID REFERENCES crawl_results(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_user_url ON projects(user_id, url);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_brand_dna ON projects(brand_dna_id);

-- Database schema additions for "Sign in with Google".
-- `password_hash` stays NOT NULL and every Google-created account still gets
-- one - a random, never-issued, argon2-hashed value (see auth.service.ts) -
-- rather than loosening that constraint, so the existing password login path
-- needs zero changes and can't be tricked into accepting an empty/null hash.
-- `google_id` (the token's stable `sub` claim) is the primary match key;
-- `auth_provider` is informational (which flow created/last-linked the
-- account) for support/debugging, not itself a security boundary.
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) NOT NULL DEFAULT 'local';
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;

-- Database schema additions for email verification & password reset.
-- Tokens are stored as the raw random string (not a hash), matching the
-- existing convention for refresh_tokens.token in this schema - unpredictable
-- (32 random bytes) plus a short expiry is the security boundary, same as
-- refresh tokens already rely on.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
-- Google-authenticated accounts are marked verified at creation time
-- (Google already verified the email - see authenticateWithGoogle in
-- auth.service.ts), so this only meaningfully starts FALSE for local
-- (password) registrations.

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user ON email_verification_tokens(user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);

-- Database schema addition for chat history persistence (chat.service.ts).
-- Previously the LangGraph website Q&A chatbot's conversation history lived
-- only in the frontend's component state - a page refresh silently lost it,
-- and there was no way to show it again after reopening the Business DNA
-- view. One row per turn (both user and assistant messages), scoped by
-- (user_id, brand_dna_id) so history is per-user even if brand ownership
-- ever changes, and ordered by created_at for replay.
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_dna_id UUID NOT NULL REFERENCES crawl_results(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL, -- 'user' | 'assistant'
    content TEXT NOT NULL,
    grounded BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_brand ON chat_messages(user_id, brand_dna_id, created_at);

-- Row Level Security - closes Supabase's "table publicly accessible" /
-- "sensitive data publicly accessible" findings. Supabase auto-exposes every
-- public-schema table over its own REST API (PostgREST, using the anon/
-- authenticated keys) independent of anything this app does - with RLS off,
-- that API can read/write every table directly, completely bypassing this
-- app's own requireAuth middleware, since PostgREST is a separate access
-- path this app never goes through.
--
-- This app only ever talks to Postgres directly via `pg`
-- (DATABASE_URL, connected as the postgres.<project-ref> pooler role - see
-- src/db/index.ts) - it never uses @supabase/supabase-js or an anon key, so
-- the PostgREST surface these tables are exposed on is entirely unused by
-- the app itself. Enabling RLS with zero policies denies the anon/
-- authenticated PostgREST roles by default while leaving this app's own
-- connection unaffected, since the postgres role bypasses RLS - no policies
-- to write or keep in sync with the app's own ownership logic (already
-- enforced in application code, e.g. asset.service.ts/brandDna.service.ts).
-- Idempotent - safe to run on every boot alongside the rest of this file.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_pages ENABLE ROW LEVEL SECURITY;


