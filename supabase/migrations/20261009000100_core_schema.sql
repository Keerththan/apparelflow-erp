-- ApparelFlow ERP — Cutting Gatekeeper core schema
-- Run in the Supabase SQL Editor (in order with the other migrations).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum (
  'cutting_supervisor',
  'cutting_verifier',
  'sewing_supervisor'
);

create type public.order_status as enum (
  'CUTTING_IN_PROGRESS',
  'PENDING_VERIFICATION',
  'REJECTED',
  'VERIFIED',
  'SEWING_IN_PROGRESS'
);

create type public.component_status as enum ('GREEN', 'YELLOW', 'RED');

create type public.verification_decision as enum ('APPROVED', 'REJECTED');

-- ---------------------------------------------------------------------------
-- users  (Supabase Auth owns credentials: auth.users stores the bcrypt
-- password hash. public.profiles holds the application-level user record.)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text not null check (length(trim(full_name)) > 0),
  role        public.app_role not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- recipes (Bill of Materials) and their cut components
-- ---------------------------------------------------------------------------
create table public.recipes (
  id                uuid primary key default gen_random_uuid(),
  recipe_code       text not null unique,
  name              text not null,
  category          text not null,
  std_fabric_yards  numeric(6, 2) not null check (std_fabric_yards > 0),
  wastage_cap       numeric(5, 2) not null check (wastage_cap between 0 and 100),
  created_at        timestamptz not null default now()
);

create table public.recipe_components (
  id                  uuid primary key default gen_random_uuid(),
  recipe_id           uuid not null references public.recipes (id) on delete cascade,
  component_name      text not null,
  pieces_per_garment  integer not null check (pieces_per_garment > 0),
  image_url           text,
  sort_order          integer not null default 0,
  unique (recipe_id, component_name)
);

create index recipe_components_recipe_id_idx on public.recipe_components (recipe_id);

-- ---------------------------------------------------------------------------
-- cutting_orders
-- ---------------------------------------------------------------------------
create sequence public.cutting_order_no_seq;

create table public.cutting_orders (
  id                   uuid primary key default gen_random_uuid(),
  order_no             text not null unique
                       default 'CO-' || lpad(nextval('public.cutting_order_no_seq')::text, 5, '0'),
  recipe_id            uuid not null references public.recipes (id) on delete restrict,
  target_qty           integer not null check (target_qty > 0),
  fabric_roll_id       text not null check (length(trim(fabric_roll_id)) > 0),
  actual_fabric_yds    numeric(10, 2) not null check (actual_fabric_yds > 0),
  -- Snapshot of target_qty * recipe.std_fabric_yards at creation time, so a
  -- later recipe edit cannot rewrite the wastage baseline of an old order.
  expected_fabric_yds  numeric(10, 2) not null check (expected_fabric_yds > 0),
  status               public.order_status not null default 'CUTTING_IN_PROGRESS',
  created_by           uuid not null references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  submitted_at         timestamptz,

  -- Immutable audit fields written when the order becomes VERIFIED
  verified_by          uuid references public.profiles (id),
  verified_at          timestamptz,
  wastage_pct          numeric(7, 2),

  sewing_started_by    uuid references public.profiles (id),
  sewing_started_at    timestamptz,

  -- A batch can only sit in VERIFIED / SEWING_IN_PROGRESS with full attribution
  constraint verified_orders_have_audit check (
    status not in ('VERIFIED', 'SEWING_IN_PROGRESS')
    or (verified_by is not null and verified_at is not null and wastage_pct is not null)
  ),
  constraint sewing_orders_have_start check (
    status <> 'SEWING_IN_PROGRESS'
    or (sewing_started_by is not null and sewing_started_at is not null)
  )
);

create index cutting_orders_status_idx on public.cutting_orders (status);
create index cutting_orders_recipe_id_idx on public.cutting_orders (recipe_id);
create index cutting_orders_created_by_idx on public.cutting_orders (created_by);
create index cutting_orders_verified_by_idx on public.cutting_orders (verified_by);
create index cutting_orders_sewing_started_by_idx on public.cutting_orders (sewing_started_by);

-- ---------------------------------------------------------------------------
-- verification_items — one row per recipe component per order
-- ---------------------------------------------------------------------------
create table public.verification_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.cutting_orders (id) on delete cascade,
  component_id  uuid not null references public.recipe_components (id),
  expected_qty  integer not null check (expected_qty > 0),
  actual_qty    integer check (actual_qty >= 0),
  -- Derived by the database, never accepted from a client.
  -- NULL means the component has not been counted yet.
  status        public.component_status generated always as (
                  case
                    when actual_qty is null then null
                    when actual_qty = expected_qty then 'GREEN'::public.component_status
                    when actual_qty > expected_qty then 'YELLOW'::public.component_status
                    else 'RED'::public.component_status
                  end
                ) stored,
  counted_at    timestamptz,
  unique (order_id, component_id)
);

create index verification_items_order_id_idx on public.verification_items (order_id);
create index verification_items_component_id_idx on public.verification_items (component_id);

-- ---------------------------------------------------------------------------
-- verification_logs — append-only audit trail of every QC decision
-- ---------------------------------------------------------------------------
create table public.verification_logs (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.cutting_orders (id) on delete restrict,
  verifier_id     uuid not null references public.profiles (id),
  decision        public.verification_decision not null,
  rejection_note  text,
  wastage_pct     numeric(7, 2),
  -- Per-component snapshot: [{component_id, component_name, expected_qty, actual_qty, variance, status}]
  variances       jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  constraint rejection_requires_note check (
    decision <> 'REJECTED'
    or (rejection_note is not null and length(trim(rejection_note)) > 0)
  ),
  constraint approval_requires_wastage check (
    decision <> 'APPROVED' or wastage_pct is not null
  )
);

create index verification_logs_order_id_idx on public.verification_logs (order_id);
create index verification_logs_verifier_id_idx on public.verification_logs (verifier_id);
