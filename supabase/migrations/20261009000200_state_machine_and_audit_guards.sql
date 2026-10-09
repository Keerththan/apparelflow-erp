-- State machine + immutable audit trail, enforced by triggers.
--
-- These triggers fire for EVERY writer (API, direct PostgREST calls, the
-- service role, the SQL editor), so the production rules hold even if an
-- application-layer check is bypassed or has a bug.
--
-- Custom SQLSTATEs (mapped to HTTP codes by the API layer):
--   AF403 forbidden · AF404 not found · AF409 illegal state · AF422 invalid data

-- ---------------------------------------------------------------------------
-- cutting_orders: legal transitions + frozen fields
-- ---------------------------------------------------------------------------
create or replace function public.guard_cutting_order_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Identity / recipe fields never change after creation
  if (new.id, new.order_no, new.recipe_id, new.target_qty, new.expected_fabric_yds,
      new.created_by, new.created_at)
     is distinct from
     (old.id, old.order_no, old.recipe_id, old.target_qty, old.expected_fabric_yds,
      old.created_by, old.created_at) then
    raise exception 'Order identity and recipe fields are immutable'
      using errcode = 'AF409';
  end if;

  -- Fabric inputs can only change while the batch is being (re-)cut
  if (new.fabric_roll_id, new.actual_fabric_yds)
     is distinct from (old.fabric_roll_id, old.actual_fabric_yds)
     and new.status <> 'CUTTING_IN_PROGRESS' then
    raise exception 'Fabric details can only change while cutting is in progress'
      using errcode = 'AF409';
  end if;

  -- Verification audit fields are write-once
  if old.verified_at is not null
     and (new.verified_by, new.verified_at, new.wastage_pct)
         is distinct from (old.verified_by, old.verified_at, old.wastage_pct) then
    raise exception 'Verification audit fields are immutable'
      using errcode = 'AF409';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'CUTTING_IN_PROGRESS'  and new.status = 'PENDING_VERIFICATION') or
      (old.status = 'PENDING_VERIFICATION' and new.status in ('VERIFIED', 'REJECTED')) or
      (old.status = 'REJECTED'             and new.status = 'CUTTING_IN_PROGRESS') or
      (old.status = 'VERIFIED'             and new.status = 'SEWING_IN_PROGRESS')
    ) then
      raise exception 'Illegal status transition % -> %', old.status, new.status
        using errcode = 'AF409';
    end if;

    if new.status = 'VERIFIED' then
      -- Hard stop: every component counted and none short
      if not exists (select 1 from public.verification_items where order_id = new.id) then
        raise exception 'Order has no components to verify' using errcode = 'AF422';
      end if;
      if exists (
        select 1 from public.verification_items
        where order_id = new.id and (status is null or status = 'RED')
      ) then
        raise exception 'Cannot verify: a component is short (RED) or uncounted'
          using errcode = 'AF422';
      end if;
      -- An APPROVED log must have been written in this same transaction
      if not exists (
        select 1 from public.verification_logs
        where order_id = new.id and decision = 'APPROVED' and created_at = now()
      ) then
        raise exception 'Verification requires an approval audit log entry'
          using errcode = 'AF409';
      end if;
    end if;

    if new.status = 'REJECTED' and not exists (
      select 1 from public.verification_logs
      where order_id = new.id and decision = 'REJECTED' and created_at = now()
    ) then
      raise exception 'Rejection requires a rejection audit log entry'
        using errcode = 'AF409';
    end if;
  end if;

  -- Sewing start fields are write-once
  if old.sewing_started_at is not null
     and (new.sewing_started_by, new.sewing_started_at)
         is distinct from (old.sewing_started_by, old.sewing_started_at) then
    raise exception 'Sewing start fields are immutable' using errcode = 'AF409';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger cutting_orders_guard_update
  before update on public.cutting_orders
  for each row execute function public.guard_cutting_order_update();

create or replace function public.guard_cutting_order_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('VERIFIED', 'SEWING_IN_PROGRESS') then
    raise exception 'Verified orders cannot be deleted' using errcode = 'AF409';
  end if;
  return old;
end;
$$;

create trigger cutting_orders_guard_delete
  before delete on public.cutting_orders
  for each row execute function public.guard_cutting_order_delete();

-- ---------------------------------------------------------------------------
-- verification_items: counts only editable while the order is open
-- ---------------------------------------------------------------------------
create or replace function public.guard_verification_item_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.order_status;
begin
  select status into v_status from public.cutting_orders where id = old.order_id;

  if tg_op = 'DELETE' then
    if v_status in ('VERIFIED', 'SEWING_IN_PROGRESS') then
      raise exception 'Verified component counts cannot be deleted' using errcode = 'AF409';
    end if;
    return old;
  end if;

  if (new.id, new.order_id, new.component_id, new.expected_qty)
     is distinct from (old.id, old.order_id, old.component_id, old.expected_qty) then
    raise exception 'Expected component counts are immutable' using errcode = 'AF409';
  end if;

  if new.actual_qty is distinct from old.actual_qty
     and v_status not in ('PENDING_VERIFICATION', 'CUTTING_IN_PROGRESS') then
    raise exception 'Counts can only be recorded while the order is pending verification'
      using errcode = 'AF409';
  end if;

  return new;
end;
$$;

create trigger verification_items_guard_change
  before update or delete on public.verification_items
  for each row execute function public.guard_verification_item_change();

-- ---------------------------------------------------------------------------
-- verification_logs: append-only
-- ---------------------------------------------------------------------------
create or replace function public.forbid_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'verification_logs is append-only' using errcode = 'AF409';
end;
$$;

create trigger verification_logs_append_only
  before update or delete on public.verification_logs
  for each row execute function public.forbid_audit_log_mutation();

create trigger verification_logs_no_truncate
  before truncate on public.verification_logs
  for each statement execute function public.forbid_audit_log_mutation();
