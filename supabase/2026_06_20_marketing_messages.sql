-- ════════════════════════════════════════════════════════════════════
-- SWARNIX — Marketing Messages (Diwali / Wedding Season campaigns)
-- Apply in Supabase SQL editor. Idempotent (IF NOT EXISTS throughout).
-- ════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- 1) marketing_message_logs — one row per customer per campaign send.
--    Written by the n8n "marketing-send" workflow after each WhatsApp
--    template message attempt, so owners can see history and we don't
--    silently lose track of failed sends.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_message_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES public.stores(owner_id) ON DELETE CASCADE,
  customer_id   uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  campaign_name text NOT NULL,         -- owner-given label, e.g. "Diwali 2026"
  template_name text NOT NULL,         -- Meta-approved WhatsApp template name used
  tier_filter   text NOT NULL,         -- 'vvip' | 'vvip_vip' | 'all' (audience selected at send time)
  status        text NOT NULL DEFAULT 'pending',  -- 'sent' | 'failed'
  error_message text,
  wa_message_id text,                  -- Meta's message id, when sent successfully
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_logs_owner_created
  ON public.marketing_message_logs (owner_id, created_at DESC);

ALTER TABLE public.marketing_message_logs ENABLE ROW LEVEL SECURITY;

-- Owners (Google-auth) manage their own logs.
DROP POLICY IF EXISTS owners_select_own_marketing_logs ON public.marketing_message_logs;
CREATE POLICY owners_select_own_marketing_logs ON public.marketing_message_logs
  FOR SELECT USING (owner_id = auth.uid());

DROP POLICY IF EXISTS owners_insert_own_marketing_logs ON public.marketing_message_logs;
CREATE POLICY owners_insert_own_marketing_logs ON public.marketing_message_logs
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Staff (anon-key store_users sessions) read-only access, matching the
-- staff_read pattern used on products/customers — filtered by owner_id
-- in the query itself (no Supabase Auth uid for staff sessions).
DROP POLICY IF EXISTS staff_read_marketing_logs ON public.marketing_message_logs;
CREATE POLICY staff_read_marketing_logs ON public.marketing_message_logs
  FOR SELECT USING (true);

-- The n8n workflow writes logs using the anon key (no Supabase Auth
-- session) on behalf of the store, so INSERT must also be allowed
-- broadly; owner_id is supplied by the trusted n8n workflow, not the
-- browser, and the workflow only ever sends what the owner confirmed.
DROP POLICY IF EXISTS service_insert_marketing_logs ON public.marketing_message_logs;
CREATE POLICY service_insert_marketing_logs ON public.marketing_message_logs
  FOR INSERT WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════
-- DONE — verify with:
--   SELECT * FROM public.marketing_message_logs LIMIT 1;
-- ════════════════════════════════════════════════════════════════════
