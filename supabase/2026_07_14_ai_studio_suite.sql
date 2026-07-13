-- ════════════════════════════════════════════════════════════════════
-- AI Studio Suite — unified monthly meter
-- ════════════════════════════════════════════════════════════════════
-- The web app is growing a "Studio Suite" section that folds the six studio
-- features (Studio Photo, Metal Swap, Jewellery Design, AI Model, Generate
-- Reels, Library) into one place. Previously AI Model and Design Studio each
-- had their OWN monthly meter on `stores`:
--
--     _ai_used     / ai_models_limit        (AI Model)
--     _design_used / design_studio_limit    (Design Studio)
--
-- Those collapse into ONE shared meter so a jeweller has a single "AI Studio
-- Suite" allowance across every feature:
--
--     stores._ai_studio_suite_used  / _ai_studio_suite_limit   (per-store)
--     subscription_plans.ai_studio_suite_limit                 (plan default → source of truth)
--
-- The plan-level number lives in `subscription_plans` (same as ai_models_limit
-- / selfie_tryon_limit); the New Owner Store Decision n8n workflow copies it
-- onto each store at signup. src/lib/plans.js keeps a matching value ONLY as a
-- client-side fallback when a store column is null/0 — the DB is authoritative.
--
-- Charging (enforced client-side, like the old meters):
--   • Image features  → +N per generation, N = images actually produced.
--   • Reels           → +reelSuiteCost(seconds, resolution) on completion.
--
-- The old columns are kept (not dropped) during the transition so nothing that
-- still reads them breaks; the app switches to the new columns.
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- 1) Plan-level default in subscription_plans (SOURCE OF TRUTH)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS ai_studio_suite_limit integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.subscription_plans.ai_studio_suite_limit IS 'Monthly AI Studio Suite generation allowance for this plan (AI Model + Jewellery Design + Studio Photo + Metal Swap images, plus reel cost). Copied onto stores._ai_studio_suite_limit at signup by the New Owner Store Decision workflow.';

UPDATE public.subscription_plans SET
  ai_studio_suite_limit = CASE plan_name
    WHEN 'trial'        THEN 20
    WHEN 'starter'      THEN 150
    WHEN 'professional' THEN 400
    WHEN 'enterprise'   THEN 1000
    ELSE ai_studio_suite_limit
  END
WHERE plan_name IN ('trial', 'starter', 'professional', 'enterprise');

-- ────────────────────────────────────────────────────────────────────
-- 2) Per-store columns on stores
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS _ai_studio_suite_used  integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS _ai_studio_suite_limit integer;

COMMENT ON COLUMN public.stores._ai_studio_suite_used  IS 'AI Studio Suite generations used this billing month. Resets with the monthly cycle like _ai_used did.';
COMMENT ON COLUMN public.stores._ai_studio_suite_limit IS 'Per-store AI Studio Suite monthly cap (copied from subscription_plans.ai_studio_suite_limit at signup). NULL/0 → fall back to the plan default in src/lib/plans.js.';

-- ────────────────────────────────────────────────────────────────────
-- 3) Backfill existing stores
-- ────────────────────────────────────────────────────────────────────
-- Used = whatever they've already spent on the two old meters this month, so
-- the switch doesn't hand anyone a fresh allowance mid-cycle.
UPDATE public.stores
   SET _ai_studio_suite_used = COALESCE(_ai_used, 0) + COALESCE(_design_used, 0)
 WHERE COALESCE(_ai_studio_suite_used, 0) = 0;

-- Limit = the plan default from subscription_plans, matched on the store's
-- current plan. Only set where not already overridden, so a hand-tuned store
-- keeps its value.
UPDATE public.stores s
   SET _ai_studio_suite_limit = sp.ai_studio_suite_limit
  FROM public.subscription_plans sp
 WHERE lower(s.plan_name) = sp.plan_name
   AND COALESCE(s._ai_studio_suite_limit, 0) = 0
   AND sp.ai_studio_suite_limit > 0;

-- ════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════
--   SELECT plan_name, ai_studio_suite_limit FROM public.subscription_plans ORDER BY plan_name;
--
--   SELECT store_name, plan_name, _ai_studio_suite_used, _ai_studio_suite_limit
--     FROM public.stores ORDER BY created_at DESC LIMIT 20;
-- ════════════════════════════════════════════════════════════════════
