-- Sewing Queue handoff (Sewing Supervisor only).
--
-- get_sewing_queue() takes NO parameters: the status filter is fixed in SQL,
-- so nothing in the URL or request body can widen it. It is SECURITY
-- INVOKER, so the RLS policy on cutting_orders applies as a second filter.

create or replace function public.get_sewing_queue()
returns setof jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if public.current_app_role() is distinct from 'sewing_supervisor' then
    raise exception 'Only a sewing supervisor can access the sewing queue'
      using errcode = 'AF403';
  end if;

  return query
  select jsonb_build_object(
           'id',                  o.id,
           'order_no',            o.order_no,
           'status',              o.status,
           'target_qty',          o.target_qty,
           'fabric_roll_id',      o.fabric_roll_id,
           'actual_fabric_yds',   o.actual_fabric_yds,
           'expected_fabric_yds', o.expected_fabric_yds,
           'wastage_pct',         o.wastage_pct,
           'verified_at',         o.verified_at,
           'verified_by',         jsonb_build_object('id', v.id, 'full_name', v.full_name),
           'recipe',              jsonb_build_object(
                                    'recipe_code', r.recipe_code,
                                    'name',        r.name,
                                    'category',    r.category,
                                    'wastage_cap', r.wastage_cap),
           'components',          coalesce((
             select jsonb_agg(jsonb_build_object(
                      'component_name', c.component_name,
                      'expected_qty',   i.expected_qty,
                      'actual_qty',     i.actual_qty,
                      'variance',       i.actual_qty - i.expected_qty,
                      'status',         i.status) order by c.sort_order)
               from public.verification_items i
               join public.recipe_components c on c.id = i.component_id
              where i.order_id = o.id), '[]'::jsonb),
           'audit_notes',         coalesce((
             select jsonb_agg(jsonb_build_object(
                      'decision',       l.decision,
                      'rejection_note', l.rejection_note,
                      'wastage_pct',    l.wastage_pct,
                      'created_at',     l.created_at,
                      'verifier',       p.full_name) order by l.created_at desc)
               from public.verification_logs l
               join public.profiles p on p.id = l.verifier_id
              where l.order_id = o.id), '[]'::jsonb)
         )
    from public.cutting_orders o
    join public.recipes r on r.id = o.recipe_id
    join public.profiles v on v.id = o.verified_by
   where o.status = 'VERIFIED'
   order by o.verified_at;
end;
$$;

-- VERIFIED -> SEWING_IN_PROGRESS
create or replace function public.start_sewing_assembly(p_order_id uuid)
returns public.cutting_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.cutting_orders;
begin
  if public.current_app_role() is distinct from 'sewing_supervisor' then
    raise exception 'Only a sewing supervisor can start sewing assembly'
      using errcode = 'AF403';
  end if;

  select * into v_order from public.cutting_orders where id = p_order_id for update;

  -- Unverified orders are reported as not found so their existence is not
  -- revealed to the sewing floor.
  if not found or v_order.status not in ('VERIFIED', 'SEWING_IN_PROGRESS') then
    raise exception 'Order not found in the sewing queue' using errcode = 'AF404';
  end if;
  if v_order.status = 'SEWING_IN_PROGRESS' then
    raise exception 'Sewing assembly has already started for this order'
      using errcode = 'AF409';
  end if;

  update public.cutting_orders
     set status = 'SEWING_IN_PROGRESS',
         sewing_started_by = auth.uid(),
         sewing_started_at = now()
   where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.get_sewing_queue() from public, anon;
revoke all on function public.start_sewing_assembly(uuid) from public, anon;
grant execute on function public.get_sewing_queue() to authenticated;
grant execute on function public.start_sewing_assembly(uuid) to authenticated;
