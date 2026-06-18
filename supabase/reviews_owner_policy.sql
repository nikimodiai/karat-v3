-- ══════════════════════════════════════════════════════════════
-- SWARNIX — Owner UPDATE policy for review moderation
-- Run this in Supabase SQL editor BEFORE using the Reviews page.
-- Safe to re-run (idempotent).
-- ══════════════════════════════════════════════════════════════
--
-- The existing schema allows:
--   • anon  → INSERT (pending only)
--   • anon + authenticated → SELECT (approved only, via RLS)
--
-- Missing: the store owner needs to UPDATE status from 'pending'
-- to 'approved' or 'rejected'. The policy below grants that right
-- ONLY to the authenticated user who owns the store row
-- (owner_id matches their Supabase Auth user id).
-- ──────────────────────────────────────────────────────────────

-- Allow the store owner to update any review that belongs to them.
-- auth.uid() is the Supabase Auth user id of the logged-in owner.
DROP POLICY IF EXISTS owner_update_own_reviews ON public.reviews;
CREATE POLICY owner_update_own_reviews
  ON public.reviews
  FOR UPDATE
  TO authenticated
  USING  (owner_id = auth.uid())          -- which rows they can UPDATE
  WITH CHECK (                            -- what values are allowed after update
    status IN ('approved', 'rejected', 'pending')
    AND owner_id = auth.uid()
  );

-- Also allow the owner to SELECT all their own reviews (pending + rejected too),
-- not just the approved ones the anon policy exposes.
DROP POLICY IF EXISTS owner_read_own_reviews ON public.reviews;
CREATE POLICY owner_read_own_reviews
  ON public.reviews
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

-- ──────────────────────────────────────────────────────────────
-- Verify: after running, the owner should be able to:
--   SELECT * FROM public.reviews WHERE owner_id = '<owner_id>';  -- all statuses
--   UPDATE public.reviews SET status = 'approved' WHERE id = '<id>';
-- ══════════════════════════════════════════════════════════════
