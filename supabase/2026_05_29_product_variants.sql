-- ════════════════════════════════════════════════════════════════════
-- Product Variants — one product, multiple carat/color combinations
-- ════════════════════════════════════════════════════════════════════
-- A ring design in 18K Yellow, 18K Rose, 14K White is ONE product with
-- THREE variants.  Each variant row carries the differentiating data:
-- carat, color, weight, making charges, price, and stock status.
--
-- The parent products row stays intact (its gold_carat / weight / price
-- serve as search-index / WhatsApp-bot fallback and the "default" display).
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.product_variants (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  owner_id            uuid        NOT NULL,                  -- mirrors products.owner_id, for RLS

  -- Core differentiators
  carat               text        NOT NULL,                  -- '22K Gold', '18K Rose Gold', etc.
  color               text        NOT NULL DEFAULT 'Yellow Gold',  -- 'Yellow Gold' | 'Rose Gold' | 'White Gold' | 'Two-Tone' | 'Silver' | custom

  -- Per-variant weight / making
  gold_purity         text,
  gold_weight_grams   numeric(10,3),
  silver_purity       text,
  silver_weight_grams numeric(10,3),
  gross_weight        numeric(10,3),                         -- total piece weight (gold + silver + stones)
  wastage_percent     numeric(5,2)  DEFAULT 0,
  making_charge_type  text          DEFAULT 'per_gram',      -- 'per_gram' | 'percent' | 'flat'
  making_charge_value numeric(10,2) DEFAULT 0,
  hallmark_charge     numeric(8,2)  DEFAULT 45,
  stone_value_inr     numeric(10,2) DEFAULT 0,

  -- Per-variant pricing
  dynamic_price       boolean       NOT NULL DEFAULT false,
  price               numeric(12,2),                         -- NULL = inherit parent price
  fixed_price         numeric(12,2),                         -- owner-typed fixed price slot

  -- Stock
  is_in_stock         boolean       NOT NULL DEFAULT true,

  -- Display order
  sort_order          smallint      DEFAULT 0,
  is_active           boolean       NOT NULL DEFAULT true,

  created_at          timestamptz   DEFAULT now(),
  updated_at          timestamptz   DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_variants_updated_at ON public.product_variants;
CREATE TRIGGER trg_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Indexes ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS product_variants_product_id_idx ON public.product_variants (product_id);
CREATE INDEX IF NOT EXISTS product_variants_owner_id_idx   ON public.product_variants (owner_id);

-- ── Row-Level Security ─────────────────────────────────────────────
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners_full_own_variants" ON public.product_variants;
CREATE POLICY "owners_full_own_variants"
  ON public.product_variants FOR ALL
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ── Backfill: one variant per existing product ─────────────────────
-- Every product that doesn't already have a variant gets one seeded
-- from its current gold_carat / weight / price fields.
INSERT INTO public.product_variants
  (product_id, owner_id, carat, color, gross_weight,
   gold_purity, gold_weight_grams,
   silver_purity, silver_weight_grams,
   making_charge_type, making_charge_value,
   wastage_percent, hallmark_charge, stone_value_inr,
   dynamic_price, price, fixed_price, is_in_stock, sort_order)
SELECT
  p.id,
  p.owner_id,
  COALESCE(p.gold_purity, p.gold_carat, 'Unknown'),
  -- Derive color from carat label: Rose/Pink → Rose Gold, White → White Gold, else Yellow Gold
  CASE
    WHEN p.gold_carat ILIKE '%rose%' OR p.gold_carat ILIKE '%pink%' THEN 'Rose Gold'
    WHEN p.gold_carat ILIKE '%white%' OR p.silver_purity IS NOT NULL  THEN 'White Gold'
    ELSE 'Yellow Gold'
  END,
  p.weight,
  p.gold_purity,
  p.gold_weight_grams,
  p.silver_purity,
  p.silver_weight_grams,
  COALESCE(p.making_charge_type,  'per_gram'),
  COALESCE(p.making_charge_value, 0),
  COALESCE(p.wastage_percent,     0),
  COALESCE(p.hallmark_charge,    45),
  COALESCE(p.stone_value_inr,     0),
  COALESCE(p.dynamic_price,      false),
  p.price,
  CASE WHEN NOT COALESCE(p.dynamic_price, false) THEN p.price ELSE NULL END,
  COALESCE(p.in_stock, true),
  0
FROM public.products p
WHERE p.is_current = true
  AND NOT EXISTS (
    SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id
  );

-- ════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════
--   SELECT product_id, carat, color, gross_weight, price, is_in_stock
--     FROM public.product_variants LIMIT 20;
-- ════════════════════════════════════════════════════════════════════
