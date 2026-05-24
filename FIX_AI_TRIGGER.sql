-- ════════════════════════════════════════════════════════════════════
-- KARAT v3 — Hotfix: drop stale triggers referencing ai_description
-- ════════════════════════════════════════════════════════════════════
-- Run this in Supabase SQL Editor if you see:
--   "record 'new' has no field 'ai_description'"
-- when adding or editing a product.
--
-- Root cause: a BEFORE INSERT/UPDATE trigger from v2 (which populated
-- ai_description, ai_title, etc.) was left on the products table after
-- the ai_* columns were dropped. PostgreSQL's trigger fires before the
-- row lands, sees that NEW has no ai_description, and aborts.
-- ════════════════════════════════════════════════════════════════════

-- ── Step 1: Show every trigger on the products table (informational) ─
-- Run this first so you can see what exists:
SELECT
  t.tgname                             AS trigger_name,
  CASE t.tgtype & 2  WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
  CASE t.tgtype & 28
    WHEN 4  THEN 'INSERT'
    WHEN 8  THEN 'DELETE'
    WHEN 16 THEN 'UPDATE'
    WHEN 20 THEN 'INSERT OR UPDATE'
    WHEN 28 THEN 'INSERT OR UPDATE OR DELETE'
    ELSE 'OTHER'
  END                                  AS event,
  p.proname                            AS function_name,
  pg_get_functiondef(p.oid)            AS function_body
FROM pg_trigger t
JOIN pg_class  c  ON c.oid  = t.tgrelid
JOIN pg_proc   p  ON p.oid  = t.tgfoid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'products'
  AND NOT t.tgisinternal   -- skip system triggers (e.g. FK enforcement)
ORDER BY t.tgname;

-- ── Step 2: Drop ALL non-system triggers on products that reference
--           any of the removed ai_* fields ──────────────────────────
DO $$
DECLARE
  r         record;
  func_body text;
BEGIN
  FOR r IN
    SELECT t.tgname AS trigger_name, p.oid AS func_oid, p.proname AS func_name
    FROM pg_trigger     t
    JOIN pg_class       c  ON c.oid = t.tgrelid
    JOIN pg_proc        p  ON p.oid = t.tgfoid
    JOIN pg_namespace   n  ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'products'
      AND NOT t.tgisinternal
  LOOP
    -- Get the function source to check whether it references ai_* columns
    SELECT pg_get_functiondef(r.func_oid) INTO func_body;

    IF func_body ILIKE '%ai_description%'
       OR func_body ILIKE '%ai_title%'
       OR func_body ILIKE '%ai_key_features%'
       OR func_body ILIKE '%ai_occasions%'
       OR func_body ILIKE '%ai_care_instructions%'
       OR func_body ILIKE '%ai_whatsapp_summary%'
       OR func_body ILIKE '%ai_style_tip%'
    THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS %I ON public.products',
        r.trigger_name
      );
      RAISE NOTICE 'Dropped stale trigger: % (function: %)',
        r.trigger_name, r.func_name;
    ELSE
      RAISE NOTICE 'Kept trigger: % (no ai_* references)', r.trigger_name;
    END IF;
  END LOOP;
END;
$$;

-- ── Step 3: Safety-net — if ai_* columns somehow still exist, drop them ─
-- (Idempotent — no error if they're already gone)
ALTER TABLE public.products DROP COLUMN IF EXISTS ai_title;
ALTER TABLE public.products DROP COLUMN IF EXISTS ai_description;
ALTER TABLE public.products DROP COLUMN IF EXISTS ai_key_features;
ALTER TABLE public.products DROP COLUMN IF EXISTS ai_occasions;
ALTER TABLE public.products DROP COLUMN IF EXISTS ai_care_instructions;
ALTER TABLE public.products DROP COLUMN IF EXISTS ai_whatsapp_summary;
ALTER TABLE public.products DROP COLUMN IF EXISTS ai_style_tip;

-- ── Step 4: Verify ───────────────────────────────────────────────────
-- After running this, you should see only 'trg_enforce_product_limit'
-- (added by MIGRATIONS.sql) and no ai_* column names in the function body.
SELECT
  t.tgname          AS trigger_name,
  p.proname         AS function_name,
  CASE t.tgtype & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing
FROM pg_trigger t
JOIN pg_class c  ON c.oid = t.tgrelid
JOIN pg_proc  p  ON p.oid = t.tgfoid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'products'
  AND NOT t.tgisinternal
ORDER BY t.tgname;
