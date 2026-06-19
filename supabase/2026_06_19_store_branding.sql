-- ════════════════════════════════════════════════════════════════════
-- SWARNIX — store branding (logo + name-style image)
-- Apply in Supabase SQL editor. Idempotent (safe to re-run).
-- ════════════════════════════════════════════════════════════════════
--
-- Lets a store owner upload their own logo icon and a styled name image
-- to show top-left in the app, replacing the default Swarnix branding.
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS logo_url text NULL;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS name_style_url text NULL;

-- ════════════════════════════════════════════════════════════════════
-- DONE.
-- ════════════════════════════════════════════════════════════════════
