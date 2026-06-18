-- ════════════════════════════════════════════════════════════════════
-- SWARNIX — per-variant images on product_variants
-- Apply in Supabase SQL editor. Idempotent (safe to re-run).
-- ════════════════════════════════════════════════════════════════════
--
-- Mirrors the products table's image columns so each variant (e.g. a
-- specific carat/color combination) can have its own photo set instead
-- of inheriting only the parent product's images.
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS primary_image_url text NULL;

-- ════════════════════════════════════════════════════════════════════
-- DONE.
-- ════════════════════════════════════════════════════════════════════
