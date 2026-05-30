-- ════════════════════════════════════════════════════════════════════
-- Voice / Style Profile — stores the AI-learned writing style for a shop
-- ════════════════════════════════════════════════════════════════════
-- The n8n karat-voice-ingest workflow parses uploaded WhatsApp chat
-- exports, extracts the shop owner's writing patterns, and writes
-- the result back into the stores table via these columns.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS voice_profile          text,       -- JSON/text style summary written by n8n
  ADD COLUMN IF NOT EXISTS voice_profile_updated_at timestamptz, -- when it was last updated
  ADD COLUMN IF NOT EXISTS voice_convo_count      integer DEFAULT 0; -- total conversations learned from

COMMENT ON COLUMN public.stores.voice_profile           IS 'AI-generated style profile text derived from owner WhatsApp exports.';
COMMENT ON COLUMN public.stores.voice_profile_updated_at IS 'Timestamp of last voice profile update.';
COMMENT ON COLUMN public.stores.voice_convo_count        IS 'Cumulative number of conversations the style profile has learned from.';

-- ════════════════════════════════════════════════════════════════════
-- VERIFY
--   SELECT owner_id, voice_profile_updated_at, voice_convo_count
--     FROM public.stores WHERE voice_profile IS NOT NULL LIMIT 5;
-- ════════════════════════════════════════════════════════════════════
