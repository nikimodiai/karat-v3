-- ════════════════════════════════════════════════════════════════════
-- Offers — store-level promotional offers with image/video + description
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.offers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  description     text,
  media_url       text,                        -- Cloudinary URL (image or video)
  media_type      text        CHECK (media_type IN ('image', 'video')),
  valid_to        date,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Index for fast per-owner lookups
CREATE INDEX IF NOT EXISTS offers_owner_id_idx ON public.offers (owner_id);

-- Keep updated_at current
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS offers_set_updated_at ON public.offers;
CREATE TRIGGER offers_set_updated_at
  BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Row-Level Security ──────────────────────────────────────────────
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

-- Owners can read their own offers
CREATE POLICY "owner_select_offers" ON public.offers
  FOR SELECT USING (auth.uid() = owner_id);

-- Owners can insert offers
CREATE POLICY "owner_insert_offers" ON public.offers
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Owners can update their own offers
CREATE POLICY "owner_update_offers" ON public.offers
  FOR UPDATE USING (auth.uid() = owner_id);

-- Owners can delete their own offers
CREATE POLICY "owner_delete_offers" ON public.offers
  FOR DELETE USING (auth.uid() = owner_id);

COMMENT ON TABLE public.offers IS 'Promotional offers created by jewellery store owners — each row has a media asset on Cloudinary and a validity period.';

-- ════════════════════════════════════════════════════════════════════
-- VERIFY
--   SELECT id, owner_id, title, valid_to, is_active FROM public.offers LIMIT 5;
-- ════════════════════════════════════════════════════════════════════
