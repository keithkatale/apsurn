-- ============================================================================
-- GTM-Apsurn Restructured Database Schema
-- Clean reset of public schema + 5-step onboarding & GTM intelligence tables
-- ============================================================================

-- 1. Drop all existing tables, views, and functions in public schema
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
  FOR r IN (SELECT table_name FROM information_schema.views WHERE table_schema = 'public') LOOP
    EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(r.table_name) || ' CASCADE';
  END LOOP;
END $$;

-- 2. Companies (Step 1: Website Scan)
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text,
  website_url text NOT NULL,
  domain text,
  status text NOT NULL DEFAULT 'ready',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_companies_user_id ON public.companies(user_id);

-- 3. Company Blueprints (Step 2: Generated Business Blueprint & ICP)
CREATE TABLE public.company_blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  icp jsonb NOT NULL DEFAULT '{}'::jsonb,
  personas jsonb NOT NULL DEFAULT '[]'::jsonb,
  value_prop text,
  positioning text,
  product_summary text,
  competitors jsonb NOT NULL DEFAULT '[]'::jsonb,
  pages_read jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence text NOT NULL DEFAULT 'model',
  approved_at timestamptz,
  edited_by_user boolean NOT NULL DEFAULT false,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_blueprints_user_id ON public.company_blueprints(user_id);

-- 4. Competitor Analyses (Step 3: Competitor Website UI & Positioning Differentiation Plan)
CREATE TABLE public.competitor_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  domain text NOT NULL,
  website_url text NOT NULL,
  screenshot_url text,
  hero_headline text,
  tagline text,
  overlap_summary text NOT NULL,
  their_weakness text NOT NULL,
  differentiation_angle text NOT NULL,
  win_play text NOT NULL,
  positioning_matrix jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_competitor_analyses_company_id ON public.competitor_analyses(company_id);
CREATE INDEX idx_competitor_analyses_user_id ON public.competitor_analyses(user_id);

-- 5. Leads / Accounts (Step 4: 50 B2B Leads / Accounts via Apify peakydev/leads-scraper-ppe)
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  full_name text NOT NULL,
  first_name text,
  last_name text,
  job_title text,
  seniority text,
  department text,
  email text,
  email_status text NOT NULL DEFAULT 'verified',
  phone text,
  linkedin_url text,
  location text,
  account_name text,
  account_domain text,
  account_website text,
  account_linkedin_url text,
  account_industry text,
  account_size text,
  account_revenue text,
  account_description text,
  fit_score integer NOT NULL DEFAULT 80,
  intent text NOT NULL DEFAULT 'buying',
  fit_reason text,
  outreach_angle text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_company_id ON public.leads(company_id);
CREATE INDEX idx_leads_user_id ON public.leads(user_id);
CREATE INDEX idx_leads_fit_score ON public.leads(fit_score DESC);

-- 6. Campaigns (Step 5: Generated Potential Outbound Campaigns & Multi-Step Sequences)
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  angle_type text NOT NULL,
  target_persona text NOT NULL,
  target_segment text NOT NULL,
  positioning_hook text NOT NULL,
  why_it_works text,
  matched_lead_count integer NOT NULL DEFAULT 0,
  sample_lead jsonb,
  sequence jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'ready',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaigns_company_id ON public.campaigns(company_id);
CREATE INDEX idx_campaigns_user_id ON public.campaigns(user_id);

-- 7. Email Verifications (Auth Support)
CREATE TABLE public.email_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  code_hash text NOT NULL,
  token_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  next_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_verifications_user_id ON public.email_verifications(user_id);
CREATE INDEX idx_email_verifications_email ON public.email_verifications(email);

-- Enable Row Level Security (with service-role full access + user access to own rows)
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own companies" ON public.companies FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own blueprints" ON public.company_blueprints FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own competitors" ON public.competitor_analyses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own leads" ON public.leads FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own campaigns" ON public.campaigns FOR ALL USING (auth.uid() = user_id);
