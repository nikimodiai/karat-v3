-- ════════════════════════════════════════════════════════════════════
-- subscription_plans — add per-plan AI Model / Selfie Try-On limits
-- ════════════════════════════════════════════════════════════════════
-- stores.ai_models_limit and stores.virtual_tryon (the Selfie Try-On
-- monthly counter limit — NOT the subscription_plans.virtual_tryon
-- feature flag, which is a separate boolean) currently have no plan-level
-- default in subscription_plans. The New Owner Store Decision n8n workflow
-- needs these to populate stores at signup, instead of hard-coding limits.
--
-- Values mirror src/lib/plans.js PLAN_LIMITS (ai_models / selfie_tryon).

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS ai_models_limit    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selfie_tryon_limit integer NOT NULL DEFAULT 0;

UPDATE public.subscription_plans SET
  ai_models_limit    = CASE plan_name
    WHEN 'trial'        THEN 20
    WHEN 'starter'      THEN 50
    WHEN 'professional' THEN 200
    WHEN 'enterprise'   THEN 500
    ELSE ai_models_limit
  END,
  selfie_tryon_limit = CASE plan_name
    WHEN 'trial'        THEN 10
    WHEN 'starter'      THEN 30
    WHEN 'professional' THEN 100
    WHEN 'enterprise'   THEN 300
    ELSE selfie_tryon_limit
  END
WHERE plan_name IN ('trial', 'starter', 'professional', 'enterprise');

-- Verify:
--   SELECT plan_name, conversation_limit, product_limit, image_storage_gb,
--          ai_models_limit, selfie_tryon_limit, monthly_budget_inr
--   FROM public.subscription_plans ORDER BY plan_name;
