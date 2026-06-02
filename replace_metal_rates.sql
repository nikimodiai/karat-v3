-- Run this once in Supabase SQL Editor (Database > SQL Editor)
-- Creates an RPC function that atomically wipes daily_metal_rates and inserts fresh rows.
-- The entire operation is one transaction: if the insert fails, the delete is rolled back.
--
-- NOTE: If you previously created this function, drop it first:
--   drop function if exists replace_metal_rates(jsonb);

create or replace function replace_metal_rates(
  p_rows jsonb
)
returns void
language plpgsql
security definer
as $$
begin
  -- WHERE true satisfies PostgREST's safety check while deleting all rows
  delete from public.daily_metal_rates where true;

  insert into public.daily_metal_rates (rate_date, metal_key, rate_inr, source, updated_at)
  select
    (r->>'rate_date')::date,
    r->>'metal_key',
    (r->>'rate_inr')::numeric,
    r->>'source',
    (r->>'updated_at')::timestamptz
  from jsonb_array_elements(p_rows) as r;
end;
$$;

-- Allow the service role (used by n8n) to call this function
grant execute on function replace_metal_rates(jsonb) to service_role;
