-- ════════════════════════════════════════════════════════════════════
-- KARAT v3 — Database Migration
-- ════════════════════════════════════════════════════════════════════
-- Apply in your Supabase SQL editor (in order). Each block is idempotent
-- (uses IF NOT EXISTS / DROP IF EXISTS) so it's safe to re-run.
-- Recommended: run during a low-traffic window. Total runtime < 30s
-- even on a 5k-product database.
-- ════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- 1) PRODUCTS — add video_url column, drop AI columns
-- ────────────────────────────────────────────────────────────────────
-- The video_url column holds the Cloudinary secure_url of an uploaded
-- product video (≤ 10s). Single video per product (per spec #11).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS video_url text;

-- AI-generated columns are being removed (spec #1). We DROP them so
-- the schema stays clean. If you want a safe two-phase migration,
-- comment these out for one release, deploy the v3 frontend (which
-- no longer reads them), verify everything works, then drop later.
ALTER TABLE public.products DROP COLUMN IF EXISTS ai_title;
ALTER TABLE public.products DROP COLUMN IF EXISTS ai_description;
ALTER TABLE public.products DROP COLUMN IF EXISTS ai_key_features;
ALTER TABLE public.products DROP COLUMN IF EXISTS ai_occasions;
ALTER TABLE public.products DROP COLUMN IF EXISTS ai_care_instructions;
ALTER TABLE public.products DROP COLUMN IF EXISTS ai_whatsapp_summary;
ALTER TABLE public.products DROP COLUMN IF EXISTS ai_style_tip;

-- ────────────────────────────────────────────────────────────────────
-- 2) PRODUCTS — enforce uniqueness of "current" SKU per owner
-- ────────────────────────────────────────────────────────────────────
-- A partial unique index ensures one SKU has only one is_current=true
-- row per owner — guarantees the "1 record per product" invariant
-- even if a buggy client tries to insert duplicates.
DROP INDEX IF EXISTS public.products_owner_sku_current_unique;
CREATE UNIQUE INDEX products_owner_sku_current_unique
  ON public.products(owner_id, sku)
  WHERE is_current = true;

-- ────────────────────────────────────────────────────────────────────
-- 3a) PRODUCTS — drop any stale triggers that reference ai_* columns
-- ────────────────────────────────────────────────────────────────────
-- The v2 n8n add/edit workflow used a Postgres trigger (or a Supabase
-- DB function) to auto-populate ai_title, ai_description, etc.
-- Now that those columns are dropped, any such trigger will crash every
-- INSERT/UPDATE with: "record 'new' has no field 'ai_description'".
-- We scan all triggers on the products table and drop any that reference
-- the removed columns. This is idempotent: no-op if they don't exist.
DO $$
DECLARE
  r         record;
  func_body text;
BEGIN
  FOR r IN
    SELECT t.tgname AS trigger_name, p.oid AS func_oid, p.proname AS func_name
    FROM pg_trigger     t
    JOIN pg_class       c  ON c.oid = t.tgrelid
    JOIN pg_proc        p  ON p.oid = t.tgfoid
    JOIN pg_namespace   n  ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'products'
      AND NOT t.tgisinternal
  LOOP
    SELECT pg_get_functiondef(r.func_oid) INTO func_body;
    IF func_body ILIKE '%ai_description%'
       OR func_body ILIKE '%ai_title%'
       OR func_body ILIKE '%ai_key_features%'
       OR func_body ILIKE '%ai_occasions%'
       OR func_body ILIKE '%ai_care_instructions%'
       OR func_body ILIKE '%ai_whatsapp_summary%'
       OR func_body ILIKE '%ai_style_tip%'
    THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.products', r.trigger_name);
      RAISE NOTICE 'Dropped stale ai_* trigger: %', r.trigger_name;
    END IF;
  END LOOP;
END;
$$;
-- ────────────────────────────────────────────────────────────────────
-- Client checks are bypassable. This trigger HARD-rejects any INSERT
-- that would push a store past its product_limit. Returns a clear
-- error message which the frontend already handles.
CREATE OR REPLACE FUNCTION public.enforce_product_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_count integer;
BEGIN
  -- Only check on INSERT, and only for is_current = true rows
  -- (soft-deleted rows don't count toward the limit).
  IF (TG_OP = 'INSERT' AND NEW.is_current = true) THEN
    SELECT product_limit INTO v_limit
      FROM public.stores
      WHERE owner_id = NEW.owner_id;

    -- product_limit is NOT NULL by schema, but be defensive
    IF v_limit IS NULL OR v_limit <= 0 THEN
      RETURN NEW;     -- no limit configured → allow
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM public.products
      WHERE owner_id = NEW.owner_id
        AND is_current = true;

    IF v_count >= v_limit THEN
      RAISE EXCEPTION 'Product limit reached: % of %. Upgrade your plan to add more.',
        v_count, v_limit
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_product_limit ON public.products;
CREATE TRIGGER trg_enforce_product_limit
  BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_limit();

-- ────────────────────────────────────────────────────────────────────
-- 4) STORES — ensure ai_models_limit is sensible (≥0)
-- ────────────────────────────────────────────────────────────────────
-- PostgreSQL does not support "ADD CONSTRAINT IF NOT EXISTS".
-- We guard with a DO block so the migration stays idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'stores_ai_models_limit_check'
       AND conrelid = 'public.stores'::regclass
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_ai_models_limit_check
      CHECK (ai_models_limit IS NULL OR ai_models_limit >= 0);
  END IF;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 5) ROW-LEVEL SECURITY — lock everything down to owner_id = auth.uid()
-- ────────────────────────────────────────────────────────────────────
-- Without RLS, the public anon key + a curious user can read other
-- stores' data. These policies make every row owner-scoped.

-- ── STORES table ──
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owners_select_own_store"  ON public.stores;
DROP POLICY IF EXISTS "owners_update_own_store"  ON public.stores;
CREATE POLICY "owners_select_own_store"
  ON public.stores FOR SELECT
  USING (owner_id = auth.uid());
CREATE POLICY "owners_update_own_store"
  ON public.stores FOR UPDATE
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
-- INSERT/DELETE on stores stays admin-only (no policy → service-role only)

-- ── PRODUCTS table ──
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owners_full_own_products" ON public.products;
CREATE POLICY "owners_full_own_products"
  ON public.products FOR ALL
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ── CUSTOMERS table ──
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owners_full_own_customers" ON public.customers;
CREATE POLICY "owners_full_own_customers"
  ON public.customers FOR ALL
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ── MONTHLY_USAGE, WHATSAPP_LOGS, CONVERSATION_SESSIONS, ALERT_FLAGS ──
-- These may be VIEWs in some Supabase project setups (e.g. views over the
-- underlying n8n-populated tables). RLS cannot be enabled on views.
-- We use a DO block that checks pg_class.relkind before attempting.
-- relkind = 'r' means regular table; 'v' = view; 'm' = materialized view.
DO $$
DECLARE
  tbl text;
  tbl_kind char;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'monthly_usage', 'whatsapp_logs',
    'conversation_sessions', 'alert_flags'
  ] LOOP
    SELECT relkind INTO tbl_kind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = tbl;

    IF tbl_kind = 'r' THEN
      -- It's a real table — enable RLS and add owner-read policy
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

      -- Drop and recreate the SELECT policy
      EXECUTE format(
        'DROP POLICY IF EXISTS "owners_read_own_%s" ON public.%I',
        tbl, tbl
      );
      EXECUTE format(
        $pol$CREATE POLICY "owners_read_own_%s"
          ON public.%I FOR SELECT
          USING (owner_id = auth.uid())$pol$,
        tbl, tbl
      );
      RAISE NOTICE 'RLS enabled on table: %', tbl;
    ELSE
      RAISE NOTICE 'Skipping RLS on % (relkind=%) — not a regular table', tbl, COALESCE(tbl_kind, 'missing');
    END IF;
  END LOOP;
END;
$$;

-- ── Reference tables — readable by everyone ──
-- Same guard: only alter if the object is a real table.
DO $$
DECLARE
  tbl text;
  tbl_kind char;
  policy_name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'jewellery_categories', 'jewellery_sub_categories', 'subscription_plans'
  ] LOOP
    SELECT relkind INTO tbl_kind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = tbl;

    IF tbl_kind = 'r' THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      policy_name := 'public_read_' || tbl;
      -- Use %I (identifier / double-quotes) for the policy name, NOT %L (string literal / single-quotes)
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING (true)',
        policy_name, tbl
      );
      RAISE NOTICE 'Public-read RLS enabled on: %', tbl;
    ELSE
      RAISE NOTICE 'Skipping %: not a regular table (relkind=%)', tbl, COALESCE(tbl_kind, 'missing');
    END IF;
  END LOOP;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 6) SUBSCRIPTION_PLANS — seed/update the four plans
-- ────────────────────────────────────────────────────────────────────
INSERT INTO public.subscription_plans
  (plan_name, conversation_limit, monthly_budget_inr, product_limit,
   image_storage_gb, has_image_search, has_voice_search, monthly_price_inr,
   description, ai_models, customer_tiers, analytics, virtual_tryon)
VALUES
  ('trial',         50,    0,       50,    1,  TRUE,  TRUE,     0, 'Trial — full Professional features for evaluation',          TRUE,  TRUE,  'PROFESSIONAL', TRUE),
  ('starter',      500,  250,      500,    5,  FALSE, FALSE, 3500, 'Starter — WhatsApp bot + inventory',                          FALSE, FALSE, 'STARTER',      FALSE),
  ('professional',2000,  500,     5000,   25,  TRUE,  TRUE,  8500, 'Professional — voice/image search, CRM tiers, advanced AI', TRUE,  TRUE,  'PROFESSIONAL', TRUE),
  ('enterprise', 100000, 5000, 1000000,  500,  TRUE,  TRUE, 18000, 'Enterprise — unlimited everything, fair-use',                 TRUE,  TRUE,  'ENTERPRISE',   TRUE)
ON CONFLICT (plan_name) DO UPDATE SET
  conversation_limit = EXCLUDED.conversation_limit,
  monthly_budget_inr = EXCLUDED.monthly_budget_inr,
  product_limit      = EXCLUDED.product_limit,
  image_storage_gb   = EXCLUDED.image_storage_gb,
  has_image_search   = EXCLUDED.has_image_search,
  has_voice_search   = EXCLUDED.has_voice_search,
  monthly_price_inr  = EXCLUDED.monthly_price_inr,
  description        = EXCLUDED.description,
  ai_models          = EXCLUDED.ai_models,
  customer_tiers     = EXCLUDED.customer_tiers,
  analytics          = EXCLUDED.analytics,
  virtual_tryon      = EXCLUDED.virtual_tryon;

-- ────────────────────────────────────────────────────────────────────
-- 7) (Optional) DAILY_METAL_RATES — for the pricing calculator
-- ────────────────────────────────────────────────────────────────────
-- If you wire a scheduled n8n workflow to fetch live gold/silver rates,
-- write them here and the frontend will read from this table instead
-- of the hard-coded defaults.
CREATE TABLE IF NOT EXISTS public.daily_metal_rates (
  rate_date  date    NOT NULL DEFAULT CURRENT_DATE,
  metal_key  text    NOT NULL,   -- '24K' | '22K' | '925 Silver' | …
  rate_inr   numeric NOT NULL,
  source     text,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (rate_date, metal_key)
);
ALTER TABLE public.daily_metal_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_rates" ON public.daily_metal_rates;
CREATE POLICY "public_read_rates" ON public.daily_metal_rates
  FOR SELECT USING (true);

-- ════════════════════════════════════════════════════════════════════
-- DONE
-- ════════════════════════════════════════════════════════════════════
-- Verify with these queries:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'products' AND column_name IN ('video_url','ai_title');
--   -- video_url should appear; ai_title should not.
--
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'products' AND indexname LIKE '%current%';
--
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_enforce_product_limit';
-- ════════════════════════════════════════════════════════════════════
