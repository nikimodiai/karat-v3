-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Add dynamic_price toggle column
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS dynamic_price boolean NOT NULL DEFAULT false;

-- 2. Add visibility column
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'all'
  CHECK (visibility IN ('all', 'vvip', 'vvip_vip'));

-- Optional: index for fast filtering by visibility
CREATE INDEX IF NOT EXISTS idx_products_visibility
  ON public.products (owner_id, visibility)
  WHERE is_current = true;

-- Optional: index for dynamic-price batch job
CREATE INDEX IF NOT EXISTS idx_products_dynamic_price
  ON public.products (owner_id, dynamic_price)
  WHERE is_current = true AND dynamic_price = true;
