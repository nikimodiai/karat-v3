-- ════════════════════════════════════════════════════════════════════
-- AI Design Studio — owner-facing jewellery design tool
-- ════════════════════════════════════════════════════════════════════
-- An owner designs a piece the way a jeweller does (metal, purity, weight,
-- stones, setting, motif, size), generates a photorealistic render with
-- Vertex AI, gets a price estimate + maker's spec sheet, then decides per
-- design: discard, save to a private library, or publish into the catalog.
--
-- Every design keeps its full parameter set as JSONB so it can be reopened,
-- edited and regenerated later. A saved design can be published any time.
--
-- Idempotent: uses IF NOT EXISTS / DROP IF EXISTS so it's safe to re-run.
-- ════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- 1) DESIGN_STUDIO_DESIGNS — one row per design
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.design_studio_designs (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           uuid        NOT NULL,                 -- tenant key, mirrors every other table

  -- Promoted columns (cheap to list/filter without unpacking the JSON)
  piece_type         text,                                -- 'Necklace', 'Ring', 'Jhumka', …
  style              text,                                -- 'Temple', 'Kundan', 'Polki', …
  status             text        NOT NULL DEFAULT 'draft', -- draft | saved | published | discarded
  mode               text        NOT NULL DEFAULT 'scratch', -- 'scratch' | 'reference'

  -- The whole structured form (steps 1–8). Lets us reopen/edit/regenerate
  -- without spreading 40+ columns across the table.
  params             jsonb       NOT NULL DEFAULT '{}'::jsonb,

  reference_image_url text,                               -- Mode B: the uploaded reference (Cloudinary)
  prompt_text        text,                                -- the prompt we actually sent to the model

  render_urls        text[]      DEFAULT '{}',            -- generated render(s), Cloudinary URLs
  primary_render_url text,

  price_estimate     jsonb,                               -- { metalCost, makingCost, stoneCost, gst, total, … }
  spec_sheet         jsonb,                               -- the maker's tech-pack fields

  published_product_id uuid,                              -- set when published into public.products

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Keep updated_at fresh. Reuses the shared set_updated_at() created in the
-- product_variants migration; redefined here so this file runs standalone.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_designs_updated_at ON public.design_studio_designs;
CREATE TRIGGER trg_designs_updated_at
  BEFORE UPDATE ON public.design_studio_designs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Listing the library = "this owner's non-discarded designs, newest first".
CREATE INDEX IF NOT EXISTS design_studio_owner_created_idx
  ON public.design_studio_designs (owner_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────────
-- 2) ROW-LEVEL SECURITY — owner-scoped, same pattern as products/variants
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.design_studio_designs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners_full_own_designs" ON public.design_studio_designs;
CREATE POLICY "owners_full_own_designs"
  ON public.design_studio_designs FOR ALL
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────
-- 3) STORES — Design Studio usage counter + per-store limit
-- ────────────────────────────────────────────────────────────────────
-- Mirrors the existing _ai_used / ai_models_limit pair. _design_used counts
-- generations this billing month; design_studio_limit is the per-store cap
-- (NULL/0 → fall back to the plan default in src/lib/plans.js).
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS _design_used        integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS design_studio_limit integer;

COMMENT ON COLUMN public.stores._design_used        IS 'Design Studio generations used this month (resets with the monthly cycle, like _ai_used).';
COMMENT ON COLUMN public.stores.design_studio_limit IS 'Per-store Design Studio monthly cap. NULL/0 → use the plan default from PLAN_LIMITS.';

-- ════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════
--   SELECT id, piece_type, status, primary_render_url
--     FROM public.design_studio_designs LIMIT 20;
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'stores'
--      AND column_name IN ('_design_used','design_studio_limit');
-- ════════════════════════════════════════════════════════════════════
