-- Verification gatekeeper: save counts, approve, reject, re-cut.
--
-- Counts are passed as a JSON array: [{"item_id": "<uuid>", "actual_qty": 48}, ...]
-- Every function derives the caller from auth.uid(); verifier identity and
-- timestamps are never accepted as parameters.

-- ---------------------------------------------------------------------------
-- Internal: validate and store physical counts for an order (no role check —
-- only callable from the SECURITY DEFINER functions below).
-- ---------------------------------------------------------------------------
create or replace function public.apply_verification_counts(
  p_order_id uuid,
  p_counts   jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry   jsonb;
  v_item_id uuid;
  v_qty     integer;
begin
  if p_counts is null then
    return;
  end if;

  if jsonb_typeof(p_counts) <> 'array' then
    raise exception 'Counts must be an array' using errcode = 'AF422';
  end if;

  for v_entry in select * from jsonb_array_elements(p_counts) loop
    if jsonb_typeof(v_entry) <> 'object'
       or jsonb_typeof(v_entry -> 'item_id') <> 'string' then
      raise exception 'Each count needs an item_id' using errcode = 'AF422';
    end if;

    begin
      v_item_id := (v_entry ->> 'item_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Invalid item_id' using errcode = 'AF422';
    end;

    -- JSON null clears a count; otherwise a whole number >= 0 is required
    if jsonb_typeof(v_entry -> 'actual_qty') = 'null' then
      v_qty := null;
    elsif jsonb_typeof(v_entry -> 'actual_qty') = 'number'
          and (v_entry ->> 'actual_qty') ~ '^\d+$'
          and (v_entry ->> 'actual_qty')::numeric <= 1000000 then
      v_qty := (v_entry ->> 'actual_qty')::integer;
    else
      raise exception 'Counted quantity must be a whole number of 0 or more'
        using errcode = 'AF422';
    end if;

    update public.verification_items
       set actual_qty = v_qty,
           counted_at = case when v_qty is null then null else now() end
     where id = v_item_id and order_id = p_order_id;

    if not found then
      raise exception 'Item % does not belong to this order', v_item_id
        using errcode = 'AF422';
    end if;
  end loop;
end;
$$;

-- Locks the order and checks the caller is a verifier acting on a pending order
create or replace function public.lock_order_for_verification(p_order_id uuid)
returns public.cutting_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.cutting_orders;
begin
  if public.current_app_role() is distinct from 'cutting_verifier' then
    raise exception 'Only a cutting verifier can verify batches'
      using errcode = 'AF403';
  end if;

  select * into v_order from public.cutting_orders where id = p_order_id for update;
  if not found then
    raise exception 'Cutting order not found' using errcode = 'AF404';
  end if;

  if v_order.status <> 'PENDING_VERIFICATION' then
    raise exception 'Order is not pending verification (current: %)', v_order.status
      using errcode = 'AF409';
  end if;

  return v_order;
end;
$$;

-- Per-component snapshot written into the audit log
create or replace function public.verification_variances(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'component_id',   i.component_id,
           'component_name', c.component_name,
           'expected_qty',   i.expected_qty,
           'actual_qty',     i.actual_qty,
           'variance',       i.actual_qty - i.expected_qty,
           'status',         i.status
         ) order by c.sort_order), '[]'::jsonb)
    from public.verification_items i
    join public.recipe_components c on c.id = i.component_id
   where i.order_id = p_order_id
$$;

-- ---------------------------------------------------------------------------
-- save_verification_counts: persist counts without deciding (survives reloads)
-- ---------------------------------------------------------------------------
create or replace function public.save_verification_counts(
  p_order_id uuid,
  p_counts   jsonb
)
returns setof public.verification_items
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_order_for_verification(p_order_id);
  perform public.apply_verification_counts(p_order_id, p_counts);
  return query
    select * from public.verification_items where order_id = p_order_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- approve_cutting_order: the hard stop
-- ---------------------------------------------------------------------------
create or replace function public.approve_cutting_order(
  p_order_id uuid,
  p_counts   jsonb default null
)
returns public.cutting_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order    public.cutting_orders;
  v_short    integer;
  v_missing  integer;
  v_wastage  numeric(7, 2);
begin
  v_order := public.lock_order_for_verification(p_order_id);
  perform public.apply_verification_counts(p_order_id, p_counts);

  select count(*) filter (where status = 'RED'),
         count(*) filter (where status is null)
    into v_short, v_missing
    from public.verification_items
   where order_id = p_order_id;

  if v_missing > 0 then
    raise exception 'Cannot approve: % component(s) not counted', v_missing
      using errcode = 'AF422';
  end if;
  if v_short > 0 then
    raise exception 'Cannot approve: % component(s) short (RED). Reject the batch for re-cutting', v_short
      using errcode = 'AF422';
  end if;

  v_wastage := round(
    (v_order.actual_fabric_yds - v_order.expected_fabric_yds)
      / v_order.expected_fabric_yds * 100, 2);

  insert into public.verification_logs (order_id, verifier_id, decision, wastage_pct, variances)
  values (p_order_id, auth.uid(), 'APPROVED', v_wastage,
          public.verification_variances(p_order_id));

  update public.cutting_orders
     set status = 'VERIFIED',
         verified_by = auth.uid(),
         verified_at = now(),
         wastage_pct = v_wastage
   where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- reject_cutting_order: mandatory reason, returns batch to the supervisor
-- ---------------------------------------------------------------------------
create or replace function public.reject_cutting_order(
  p_order_id uuid,
  p_note     text,
  p_counts   jsonb default null
)
returns public.cutting_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.cutting_orders;
  v_note  text := trim(p_note);
begin
  v_order := public.lock_order_for_verification(p_order_id);

  if v_note is null or length(v_note) < 5 or length(v_note) > 1000 then
    raise exception 'A rejection reason of 5-1000 characters is required'
      using errcode = 'AF422';
  end if;

  perform public.apply_verification_counts(p_order_id, p_counts);

  insert into public.verification_logs (order_id, verifier_id, decision, rejection_note, variances)
  values (p_order_id, auth.uid(), 'REJECTED', v_note,
          public.verification_variances(p_order_id));

  update public.cutting_orders
     set status = 'REJECTED'
   where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- recut_cutting_order: supervisor restarts a rejected batch
-- ---------------------------------------------------------------------------
create or replace function public.recut_cutting_order(
  p_order_id          uuid,
  p_actual_fabric_yds numeric default null
)
returns public.cutting_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.cutting_orders;
begin
  if public.current_app_role() is distinct from 'cutting_supervisor' then
    raise exception 'Only a cutting supervisor can re-cut batches'
      using errcode = 'AF403';
  end if;

  select * into v_order from public.cutting_orders where id = p_order_id for update;
  if not found then
    raise exception 'Cutting order not found' using errcode = 'AF404';
  end if;
  if v_order.status <> 'REJECTED' then
    raise exception 'Only rejected orders can be re-cut (current: %)', v_order.status
      using errcode = 'AF409';
  end if;

  if p_actual_fabric_yds is not null
     and (p_actual_fabric_yds <= 0 or p_actual_fabric_yds > 1000000
          or p_actual_fabric_yds <> round(p_actual_fabric_yds, 2)) then
    raise exception 'Actual fabric used must be a positive number with at most 2 decimals'
      using errcode = 'AF422';
  end if;

  update public.cutting_orders
     set status = 'CUTTING_IN_PROGRESS',
         submitted_at = null,
         actual_fabric_yds = coalesce(p_actual_fabric_yds, actual_fabric_yds)
   where id = p_order_id
  returning * into v_order;

  -- The previous counts stay in the audit log; the new cut is counted fresh
  update public.verification_items
     set actual_qty = null, counted_at = null
   where order_id = p_order_id;

  return v_order;
end;
$$;

revoke all on function public.apply_verification_counts(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.lock_order_for_verification(uuid) from public, anon, authenticated;
revoke all on function public.verification_variances(uuid) from public, anon, authenticated;

revoke all on function public.save_verification_counts(uuid, jsonb) from public, anon;
revoke all on function public.approve_cutting_order(uuid, jsonb) from public, anon;
revoke all on function public.reject_cutting_order(uuid, text, jsonb) from public, anon;
revoke all on function public.recut_cutting_order(uuid, numeric) from public, anon;

grant execute on function public.save_verification_counts(uuid, jsonb) to authenticated;
grant execute on function public.approve_cutting_order(uuid, jsonb) to authenticated;
grant execute on function public.reject_cutting_order(uuid, text, jsonb) to authenticated;
grant execute on function public.recut_cutting_order(uuid, numeric) to authenticated;
