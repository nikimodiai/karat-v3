-- ════════════════════════════════════════════════════════════════════
-- New pricing (Jul 2026) — APPLIED to prod via MCP on 2026-07-18 as
-- migrations `basic_plan_new_pricing_2026_07` and
-- `selfie_tryon_uses_studio_suite_meter`. Kept here for the repo record.
--
-- 1. New Basic ₹999 plan (WhatsApp agent + inventory only).
-- 2. Starter/Pro limits shift up one tier:
--      Trial 200/100/1GB · Basic 1000/500/5GB · Starter 3000/1000/25GB ·
--      Pro 10000/5000/100GB. Enterprise kept as hidden/custom tier.
-- 3. has_storefront flag (Trial/Pro/Enterprise = true).
-- 4. Selfie Try-On no longer has its own meter — reserve/refund RPCs now
--    deduct from stores._ai_studio_suite_used against _ai_studio_suite_limit,
--    gated by subscription_plans.virtual_tryon for the store's plan.
--    stores.virtual_tryon + stores._vt_used are now legacy/unused.
-- 5. Existing stores re-synced to their plan's new limits.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS has_storefront boolean NOT NULL DEFAULT false;
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS has_storefront boolean NOT NULL DEFAULT false;

INSERT INTO public.subscription_plans
  (plan_name, conversation_limit, monthly_budget_inr, product_limit,
   image_storage_gb, has_image_search, has_voice_search, monthly_price_inr,
   description, ai_models, customer_tiers, analytics, virtual_tryon,
   ai_models_limit, selfie_tryon_limit, ai_studio_suite_limit, has_storefront)
SELECT 'basic', 1000, 150, 500, 5, false, false, 999,
       'Basic — WhatsApp AI agent + inventory & dynamic pricing',
       false, false, 'BASIC', false, 0, 0, 0, false
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE plan_name = 'basic');

UPDATE public.subscription_plans SET
  image_storage_gb  = 1,
  monthly_price_inr = 0,
  has_storefront    = true
WHERE plan_name = 'trial';

UPDATE public.subscription_plans SET
  conversation_limit = 3000,
  monthly_budget_inr = 500,
  product_limit      = 1000,
  image_storage_gb   = 25,
  has_image_search   = true,
  has_voice_search   = true,
  customer_tiers     = true,
  analytics          = 'ADVANCED',
  ai_models_limit    = 200,
  has_storefront     = false,
  description        = 'Starter — voice/image search, selfie try-on, customer tiers, marketing, advanced analytics'
WHERE plan_name = 'starter';

UPDATE public.subscription_plans SET
  conversation_limit = 10000,
  monthly_budget_inr = 1500,
  product_limit      = 5000,
  image_storage_gb   = 100,
  ai_models_limit    = 500,
  has_storefront     = true,
  description        = 'Pro — Most Popular - everything in Starter + your own website storefront, higher limits'
WHERE plan_name = 'professional';

UPDATE public.subscription_plans SET has_storefront = true
WHERE plan_name = 'enterprise';

-- ── Selfie Try-On → shared AI Studio Suite meter ────────────────────
-- JSON keys kept identical ('reserved'/'vt_used'/'vt_max'/'remaining') so
-- the n8n try-on workflows calling these RPCs need no changes.

CREATE OR REPLACE FUNCTION public.reserve_tryon_credit(p_owner_id uuid)
RETURNS json
LANGUAGE plpgsql
AS $function$
declare
  v_used int;
  v_max  int;
  v_allowed boolean;
begin
  select coalesce(p.virtual_tryon, false)
    into v_allowed
    from public.stores s
    left join public.subscription_plans p
      on p.plan_name = lower(coalesce(s.plan_name, 'trial'))
   where s.owner_id = p_owner_id;

  if coalesce(v_allowed, false) then
    update public.stores
       set _ai_studio_suite_used = coalesce(_ai_studio_suite_used, 0) + 1
     where owner_id = p_owner_id
       and coalesce(_ai_studio_suite_limit, 0) > 0
       and coalesce(_ai_studio_suite_used, 0) < _ai_studio_suite_limit
    returning _ai_studio_suite_used, _ai_studio_suite_limit into v_used, v_max;

    if found then
      return json_build_object(
        'reserved', true,
        'vt_used',  v_used,
        'vt_max',   v_max,
        'remaining', greatest(v_max - v_used, 0)
      );
    end if;
  end if;

  select coalesce(_ai_studio_suite_used, 0), coalesce(_ai_studio_suite_limit, 0)
    into v_used, v_max
    from public.stores
   where owner_id = p_owner_id;

  return json_build_object(
    'reserved', false,
    'vt_used',  coalesce(v_used, 0),
    'vt_max',   coalesce(v_max, 0),
    'remaining', greatest(coalesce(v_max, 0) - coalesce(v_used, 0), 0)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.refund_tryon_credit(p_owner_id uuid)
RETURNS void
LANGUAGE sql
AS $function$
  update public.stores
     set _ai_studio_suite_used = greatest(coalesce(_ai_studio_suite_used, 0) - 1, 0)
   where owner_id = p_owner_id;
$function$;

-- ── One-time re-sync of existing stores to new plan limits ──────────
UPDATE public.stores s SET
  conversation_limit     = p.conversation_limit,
  monthly_budget_inr     = p.monthly_budget_inr,
  product_limit          = p.product_limit,
  image_storage_gb       = p.image_storage_gb,
  has_image_search       = p.has_image_search,
  has_voice_search       = p.has_voice_search,
  ai_models              = p.ai_models,
  ai_models_limit        = p.ai_models_limit,
  _ai_studio_suite_limit = p.ai_studio_suite_limit,
  customer_tiers         = p.customer_tiers,
  analytics              = p.analytics,
  has_storefront         = p.has_storefront
FROM public.subscription_plans p
WHERE p.plan_name = lower(coalesce(s.plan_name, 'trial'));
