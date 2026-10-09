-- Row Level Security
--
-- The publishable key is public, so anyone can call PostgREST directly.
-- Rules:
--   * anon can read nothing.
--   * authenticated users can only SELECT; every write goes through
--     SECURITY DEFINER functions that check the caller's role.
--   * sewing_supervisor can only see orders that passed verification.

-- Caller's role, resolved from the session (auth.uid()), never from input.
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid()
$$;

revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated;

alter table public.profiles           enable row level security;
alter table public.recipes            enable row level security;
alter table public.recipe_components  enable row level security;
alter table public.cutting_orders     enable row level security;
alter table public.verification_items enable row level security;
alter table public.verification_logs  enable row level security;

-- No direct writes from API roles. (Supabase grants ALL by default.)
revoke all on table
  public.profiles, public.recipes, public.recipe_components,
  public.cutting_orders, public.verification_items, public.verification_logs
from anon;

revoke insert, update, delete, truncate, references, trigger on table
  public.profiles, public.recipes, public.recipe_components,
  public.cutting_orders, public.verification_items, public.verification_logs
from authenticated;

revoke all on sequence public.cutting_order_no_seq from anon, authenticated;

-- profiles: names are needed for audit attribution in every view
create policy "Authenticated users can read profiles"
  on public.profiles for select to authenticated
  using (true);

-- recipes / components: reference data
create policy "Authenticated users can read recipes"
  on public.recipes for select to authenticated
  using (true);

create policy "Authenticated users can read recipe components"
  on public.recipe_components for select to authenticated
  using (true);

-- cutting_orders: query isolation for the sewing floor
create policy "Cutting roles read all orders"
  on public.cutting_orders for select to authenticated
  using ((select public.current_app_role()) in ('cutting_supervisor', 'cutting_verifier'));

create policy "Sewing supervisor reads verified orders only"
  on public.cutting_orders for select to authenticated
  using (
    (select public.current_app_role()) = 'sewing_supervisor'
    and status in ('VERIFIED', 'SEWING_IN_PROGRESS')
  );

-- Child rows are visible only when the parent order is visible
-- (the subquery is itself filtered by the cutting_orders policies).
create policy "Read items of visible orders"
  on public.verification_items for select to authenticated
  using (exists (select 1 from public.cutting_orders o where o.id = order_id));

create policy "Read logs of visible orders"
  on public.verification_logs for select to authenticated
  using (exists (select 1 from public.cutting_orders o where o.id = order_id));
