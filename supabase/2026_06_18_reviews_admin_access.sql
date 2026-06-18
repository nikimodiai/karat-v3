-- ════════════════════════════════════════════════════════════════════
-- SWARNIX — admin (owner/staff) access to public.reviews for moderation
-- Apply in Supabase SQL editor. Idempotent (safe to re-run).
-- ════════════════════════════════════════════════════════════════════
--
-- public.reviews already has anon policies for the storefront:
--   • public_read_approved_reviews — anon/authenticated may SELECT status='approved'
--   • public_insert_pending_reviews — anon/authenticated may INSERT status='pending'
--
-- The admin app (Swarnix app) needs to additionally:
--   • read ALL rows for a store (pending/approved/rejected), so the owner
--     can see what's awaiting moderation, and
--   • UPDATE a row's status to 'approved' or 'rejected'.
--
-- Like every other admin table in this app (see 2026_05_30_store_users.sql),
-- both Google-OAuth owners and username/password staff hit Supabase through
-- the anon key — there is no service-role admin client. Access control is
-- enforced at the app layer via .eq('owner_id', ownerId) on every query, so
-- these policies mirror the existing "staff_*" pattern used for products/
-- customers/etc: broad `using (true)` access for anon, scoped at the query
-- layer rather than via auth.uid().
-- ────────────────────────────────────────────────────────────────────

drop policy if exists "admin_read_reviews" on public.reviews;
create policy "admin_read_reviews"
  on public.reviews for select
  to anon, authenticated
  using (true);

drop policy if exists "admin_update_reviews" on public.reviews;
create policy "admin_update_reviews"
  on public.reviews for update
  to anon, authenticated
  using (true)
  with check (status in ('pending', 'approved', 'rejected'));

-- ════════════════════════════════════════════════════════════════════
-- DONE. Owner/staff can now list all reviews for their store and flip
-- status between pending/approved/rejected from the admin app.
-- ════════════════════════════════════════════════════════════════════
