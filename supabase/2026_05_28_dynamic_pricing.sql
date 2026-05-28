-- ════════════════════════════════════════════════════════════════════
-- Dynamic Pricing — split metal columns
-- ════════════════════════════════════════════════════════════════════
-- Adds four columns to public.products so a jewellery owner can record
-- BOTH the gold and silver components of a single piece (e.g. a kundan
-- ring with a 22K gold body + 970 silver lining) and have its retail
-- price recomputed daily from public.metal_rates.
--
--   gold_purity          text     — e.g. '22K Gold' (matches METAL_PURITY_GROUPS labels)
--   gold_weight_grams    numeric  — pure-metal weight in grams (e.g. 5.20)
--   silver_purity        text     — e.g. '970 Silver (Traditional)'
--   silver_weight_grams  numeric  — pure-metal weight in grams
--
-- Idempotent: safe to re-run. Existing rows get NULLs.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS gold_purity          text,
  ADD COLUMN IF NOT EXISTS gold_weight_grams    numeric,
  ADD COLUMN IF NOT EXISTS silver_purity        text,
  ADD COLUMN IF NOT EXISTS silver_weight_grams  numeric;

COMMENT ON COLUMN public.products.gold_purity         IS 'Purity label of the gold component, e.g. "22K Gold". Used to look up rate in public.metal_rates.';
COMMENT ON COLUMN public.products.gold_weight_grams   IS 'Grams of pure gold in the piece (for dynamic-pricing recompute).';
COMMENT ON COLUMN public.products.silver_purity       IS 'Purity label of the silver component, e.g. "970 Silver". Rate is derived proportionally from silver_999 if exact purity is missing.';
COMMENT ON COLUMN public.products.silver_weight_grams IS 'Grams of pure silver in the piece (for dynamic-pricing recompute).';

-- Optional: backfill from legacy single-metal fields so existing rows
-- that already used dynamic_price keep working without owner re-entry.
-- Heuristic: if metal_type starts with 'gold_', copy gold_carat into
-- gold_purity and metal_weight_grams into gold_weight_grams; same for
-- silver. Owners can fine-tune after upgrade.
UPDATE public.products
   SET gold_purity        = COALESCE(gold_purity, gold_carat),
       gold_weight_grams  = COALESCE(gold_weight_grams, metal_weight_grams)
 WHERE dynamic_price = true
   AND metal_type LIKE 'gold_%'
   AND gold_purity IS NULL;

UPDATE public.products
   SET silver_purity        = COALESCE(silver_purity, gold_carat),
       silver_weight_grams  = COALESCE(silver_weight_grams, metal_weight_grams)
 WHERE dynamic_price = true
   AND metal_type LIKE 'silver_%'
   AND silver_purity IS NULL;

-- ════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='products'
--      AND column_name IN ('gold_purity','gold_weight_grams','silver_purity','silver_weight_grams');
-- ════════════════════════════════════════════════════════════════════
