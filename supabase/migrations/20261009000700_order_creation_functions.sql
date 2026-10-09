-- Cutting order creation & submission (Cutting Supervisor only).
--
-- These SECURITY DEFINER functions are the ONLY write path for orders.
-- The caller's identity and role come from auth.uid(), never from
-- parameters. They are also callable directly via PostgREST (/rpc), which
-- is safe because every rule is checked here, not in the client.

-- New orders always start at the beginning of the pipeline with no audit data
create or replace function public.guard_cutting_order_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'CUTTING_IN_PROGRESS'
     or new.submitted_at is not null
     or new.verified_by is not null or new.verified_at is not null or new.wastage_pct is not null
     or new.sewing_started_by is not null or new.sewing_started_at is not null then
    raise exception 'New orders must start in CUTTING_IN_PROGRESS without audit data'
      using errcode = 'AF409';
  end if;
  return new;
end;
$$;

create trigger cutting_orders_guard_insert
  before insert on public.cutting_orders
  for each row execute function public.guard_cutting_order_insert();

-- ---------------------------------------------------------------------------
-- create_cutting_order
-- ---------------------------------------------------------------------------
create or replace function public.create_cutting_order(
  p_recipe_id         uuid,
  p_target_qty        integer,
  p_fabric_roll_id    text,
  p_actual_fabric_yds numeric
)
returns public.cutting_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipe  public.recipes;
  v_roll    text := upper(trim(p_fabric_roll_id));
  v_order   public.cutting_orders;
begin
  if public.current_app_role() is distinct from 'cutting_supervisor' then
    raise exception 'Only a cutting supervisor can create cutting orders'
      using errcode = 'AF403';
  end if;

  if p_target_qty is null or p_target_qty < 1 or p_target_qty > 100000 then
    raise exception 'Target quantity must be a whole number between 1 and 100000'
      using errcode = 'AF422';
  end if;

  if v_roll is null or v_roll !~ '^[A-Z0-9][A-Z0-9-]{1,39}$' then
    raise exception 'Fabric roll ID must be 2-40 letters, digits or dashes'
      using errcode = 'AF422';
  end if;

  if p_actual_fabric_yds is null or p_actual_fabric_yds <= 0
     or p_actual_fabric_yds > 1000000
     or p_actual_fabric_yds <> round(p_actual_fabric_yds, 2) then
    raise exception 'Actual fabric used must be a positive number with at most 2 decimals'
      using errcode = 'AF422';
  end if;

  select * into v_recipe from public.recipes where id = p_recipe_id;
  if not found then
    raise exception 'Recipe not found' using errcode = 'AF404';
  end if;

  insert into public.cutting_orders (
    recipe_id, target_qty, fabric_roll_id, actual_fabric_yds,
    expected_fabric_yds, created_by
  )
  values (
    v_recipe.id, p_target_qty, v_roll, p_actual_fabric_yds,
    p_target_qty * v_recipe.std_fabric_yards, auth.uid()
  )
  returning * into v_order;

  -- Multiplier engine: expected pieces = garments x pieces per garment
  insert into public.verification_items (order_id, component_id, expected_qty)
  select v_order.id, c.id, p_target_qty * c.pieces_per_garment
  from public.recipe_components c
  where c.recipe_id = v_recipe.id;

  if not found then
    raise exception 'Recipe has no components' using errcode = 'AF422';
  end if;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_cutting_order: CUTTING_IN_PROGRESS -> PENDING_VERIFICATION
-- ---------------------------------------------------------------------------
create or replace function public.submit_cutting_order(p_order_id uuid)
returns public.cutting_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.cutting_orders;
begin
  if public.current_app_role() is distinct from 'cutting_supervisor' then
    raise exception 'Only a cutting supervisor can submit cutting orders'
      using errcode = 'AF403';
  end if;

  select * into v_order from public.cutting_orders where id = p_order_id for update;
  if not found then
    raise exception 'Cutting order not found' using errcode = 'AF404';
  end if;

  if v_order.status <> 'CUTTING_IN_PROGRESS' then
    raise exception 'Only orders in CUTTING_IN_PROGRESS can be submitted (current: %)', v_order.status
      using errcode = 'AF409';
  end if;

  update public.cutting_orders
     set status = 'PENDING_VERIFICATION', submitted_at = now()
   where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.guard_cutting_order_insert() from public, anon, authenticated;
revoke all on function public.create_cutting_order(uuid, integer, text, numeric) from public, anon;
revoke all on function public.submit_cutting_order(uuid) from public, anon;
grant execute on function public.create_cutting_order(uuid, integer, text, numeric) to authenticated;
grant execute on function public.submit_cutting_order(uuid) to authenticated;
