-- ── 2026-05-31: Diamond Color, Diamond Certification Fee, Owner FAQs ──

-- 1. Add diamond_color to products table
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS diamond_color text NULL;

-- 2. Add diamond_cert_fee to products table
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS diamond_cert_fee numeric NULL DEFAULT 0;

-- 3. Add diamond_color to product_variants table
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS diamond_purity text NULL;

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS diamond_color text NULL;

-- 4. Add diamond_cert_fee to product_variants table
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS diamond_cert_fee numeric(10, 2) NULL DEFAULT 0;

-- 5. Create owner_faqs table
CREATE TABLE IF NOT EXISTS public.owner_faqs (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL,
  question    text NOT NULL,
  answer      text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamp with time zone NOT NULL DEFAULT now(),
  updated_at  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT owner_faqs_pkey PRIMARY KEY (id),
  CONSTRAINT owner_faqs_owner_id_fkey FOREIGN KEY (owner_id)
    REFERENCES auth.users (id) ON DELETE CASCADE
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_owner_faqs_owner_id
  ON public.owner_faqs USING btree (owner_id, sort_order) TABLESPACE pg_default;

-- Auto-update updated_at on row changes
CREATE OR REPLACE TRIGGER trg_owner_faqs_updated_at
  BEFORE UPDATE ON public.owner_faqs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6. Enable RLS on owner_faqs and allow owners to manage their own FAQs
ALTER TABLE public.owner_faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_faqs_owner_all" ON public.owner_faqs
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
