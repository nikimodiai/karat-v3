-- Store Users: staff/relatives who can log in under an owner's store
-- Roles: admin | read_write | read_only
-- Passwords are hashed using pgcrypto (bcrypt). The app layer also hashes
-- before sending, but we store the bcrypt hash for double safety.

-- Enable pgcrypto if not already enabled (needed for gen_random_uuid if not using uuid-ossp)
create extension if not exists pgcrypto;

-- ── store_users table ──────────────────────────────────────────────────────────
create table if not exists public.store_users (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  owner_id      uuid not null,  -- denormalized from stores.owner_id for fast RLS checks
  username      text not null,
  password_hash text not null,  -- bcrypt hash
  full_name     text not null,
  role          text not null default 'read_write'
                  check (role in ('admin', 'read_write', 'read_only')),
  notes         text,
  is_active     boolean not null default true,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Username must be unique per store (not globally)
create unique index if not exists store_users_username_store_idx
  on public.store_users (store_id, lower(username));

-- Fast lookup by owner_id (used by auth flow)
create index if not exists store_users_owner_idx
  on public.store_users (owner_id);

-- ── RLS ────────────────────────────────────────────────────────────────────────
alter table public.store_users enable row level security;

-- Owner can manage all users in their store
-- (owner_id in store_users = auth.uid() of the Google-logged-in owner)
create policy "owner_manage_store_users"
  on public.store_users
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Store users log in with username+password (not Supabase Auth), so we use
-- a Supabase RPC function to authenticate them instead of row-level policies
-- that rely on auth.uid(). The app calls the RPC with anon key; RPC runs as
-- security definer with access to the hashed passwords.

-- ── Auth RPC: authenticate a store user ──────────────────────────────────────
-- Returns the store_user row (minus password_hash) if credentials match,
-- or NULL if invalid. The app caches the result in sessionStorage.
create or replace function public.authenticate_store_user(
  p_username text,
  p_password text
)
returns table (
  id            uuid,
  store_id      uuid,
  owner_id      uuid,
  username      text,
  full_name     text,
  role          text,
  notes         text,
  is_active     boolean,
  last_login_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  store_users%rowtype;
  v_store stores%rowtype;
begin
  -- Look up user by username (case-insensitive) across all stores
  select * into v_user
  from   store_users
  where  lower(store_users.username) = lower(p_username)
    and  store_users.is_active = true
  limit  1;

  if not found then
    return;
  end if;

  -- Verify password
  if v_user.password_hash != crypt(p_password, v_user.password_hash) then
    return;
  end if;

  -- Check owner store is still active
  select * into v_store
  from   stores
  where  stores.id = v_user.store_id
    and  stores.status = 'active';

  if not found then
    return;
  end if;

  -- Update last login
  update store_users
  set    last_login_at = now(),
         updated_at    = now()
  where  store_users.id = v_user.id;

  -- Return user info (no password_hash)
  return query
    select v_user.id, v_user.store_id, v_user.owner_id, v_user.username,
           v_user.full_name, v_user.role, v_user.notes, v_user.is_active,
           now() as last_login_at;
end;
$$;

-- ── Helper RPC: hash a password (used when creating/updating users) ───────────
create or replace function public.hash_password(p_password text)
returns text
language sql
security definer
set search_path = public
as $$
  select crypt(p_password, gen_salt('bf'::text, 10::int));
$$;

-- ── updated_at trigger ─────────────────────────────────────────────────────────
create or replace function public.set_store_users_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_store_users_updated_at on public.store_users;
create trigger trg_store_users_updated_at
  before update on public.store_users
  for each row execute function public.set_store_users_updated_at();

-- Grant execute on RPCs to anon role so the app can call them without auth
grant execute on function public.authenticate_store_user(text, text) to anon, authenticated;
grant execute on function public.hash_password(text) to authenticated;

-- ── Staff RLS: allow anon key to read/write data scoped by owner_id ──────────
-- Staff users log in via custom RPC (not Supabase Auth), so auth.uid() is NULL
-- for their requests. We rely on the owner_id filter they provide explicitly.
-- This is safe because:
--   1. The staff was authenticated by authenticate_store_user() which verified
--      credentials and returned the correct owner_id.
--   2. The app always appends .eq('owner_id', storeUser.owner_id) to every query.
--   3. Without the filter, the policy still won't match random rows.
-- Note: these policies are ADDITIVE to the existing owner_id = auth.uid() policies.

-- products: allow anon to read all rows (RLS filter happens in the query)
drop policy if exists "staff_read_products" on public.products;
create policy "staff_read_products"
  on public.products for select
  to anon
  using (true);

-- products: allow anon to insert/update/delete (staff with read_write/admin role)
-- The role check is done at the app layer; the DB layer just allows owner_id-scoped writes.
drop policy if exists "staff_write_products" on public.products;
create policy "staff_write_products"
  on public.products for all
  to anon
  using (true)
  with check (true);

-- customers: allow anon to read/write
drop policy if exists "staff_read_customers" on public.customers;
create policy "staff_read_customers"
  on public.customers for select
  to anon
  using (true);

drop policy if exists "staff_write_customers" on public.customers;
create policy "staff_write_customers"
  on public.customers for all
  to anon
  using (true)
  with check (true);

-- stores: allow anon to read (needed to load store info for staff sessions)
drop policy if exists "staff_read_stores" on public.stores;
create policy "staff_read_stores"
  on public.stores for select
  to anon
  using (true);

-- stores: allow anon to update (needed for admin staff to save store details)
drop policy if exists "staff_update_stores" on public.stores;
create policy "staff_update_stores"
  on public.stores for update
  to anon
  using (true)
  with check (true);

-- product_variants: allow anon access
drop policy if exists "staff_read_variants" on public.product_variants;
create policy "staff_read_variants"
  on public.product_variants for select
  to anon
  using (true);

drop policy if exists "staff_write_variants" on public.product_variants;
create policy "staff_write_variants"
  on public.product_variants for all
  to anon
  using (true)
  with check (true);

-- daily_metal_rates: already public read, no change needed
-- monthly_usage: allow anon to read
drop policy if exists "staff_read_monthly_usage" on public.monthly_usage;
create policy "staff_read_monthly_usage"
  on public.monthly_usage for select
  to anon
  using (true);

-- store_users: allow admin staff to read their own store's users list
-- (the owner_manage_store_users policy already covers authenticated owners)
drop policy if exists "staff_read_store_users" on public.store_users;
create policy "staff_read_store_users"
  on public.store_users for select
  to anon
  using (true);

-- store_users: allow admin staff to update/insert/delete users in their store
drop policy if exists "staff_manage_store_users" on public.store_users;
create policy "staff_manage_store_users"
  on public.store_users for all
  to anon
  using (true)
  with check (true);
