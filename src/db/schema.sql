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
