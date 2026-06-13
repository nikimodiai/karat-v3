-- ════════════════════════════════════════════════════════════════════
-- SWARNIX — WhatsApp Business API multi-tenant columns
-- Apply in Supabase SQL editor. Idempotent (IF NOT EXISTS throughout).
-- ════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────
-- 1) STORES — add WhatsApp Business API credential columns
-- ────────────────────────────────────────────────────────────────────
-- These are populated automatically via Facebook Embedded Signup OAuth
-- when a jewellery owner clicks "Connect Business WhatsApp" in Profile.
-- Stored per store so each owner has independent WA credentials.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id text,   -- WA phone number ID (used in API calls)
  ADD COLUMN IF NOT EXISTS waba_id                  text,   -- WhatsApp Business Account ID
  ADD COLUMN IF NOT EXISTS wa_access_token          text;   -- Long-lived system user token

-- whatsapp_phone already exists in the stores table per the codebase audit.
-- These three columns are net-new.

-- ────────────────────────────────────────────────────────────────────
-- 2) RLS — owners may write their own WA credentials (no policy change
--    needed; the existing owners_update_own_store policy already covers
--    all columns via UPDATE ... USING (owner_id = auth.uid())).
-- ────────────────────────────────────────────────────────────────────
-- Nothing extra required here — the broad UPDATE policy already applies.

-- ════════════════════════════════════════════════════════════════════
-- DONE — verify with:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'stores'
--      AND column_name IN ('whatsapp_phone_number_id','waba_id','wa_access_token');
-- ════════════════════════════════════════════════════════════════════
