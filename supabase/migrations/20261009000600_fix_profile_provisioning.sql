-- Fix: profile provisioning rejected every admin-created user.
--
-- Supabase Auth's admin createUser INSERTs into auth.users first and only
-- then UPDATEs raw_app_meta_data with the caller's app_metadata (see
-- supabase/auth internal/api/admin.go: tx.Create(user) -> UpdateAppMetaData).
-- The original AFTER INSERT trigger therefore never saw the role and raised,
-- rolling back the whole user creation ("Database error creating new user").
--
-- New behaviour:
--   * fire on INSERT and on UPDATE of raw_app_meta_data
--   * no role yet  -> do nothing (the user exists but has no profile, so
--                     current_app_role() is NULL and every policy denies)
--   * invalid role -> raise
--   * valid role   -> create or update the profile

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
begin
  if v_role is null then
    return new;
  end if;

  if v_role not in ('cutting_supervisor', 'cutting_verifier', 'sewing_supervisor') then
    raise exception 'User % has an invalid app_metadata.role: %', new.email, v_role
      using errcode = 'AF403';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), new.email),
    v_role::public.app_role
  )
  on conflict (id) do update
    set email     = excluded.email,
        full_name = excluded.full_name,
        role      = excluded.role;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert or update of raw_app_meta_data on auth.users
  for each row execute function public.handle_new_auth_user();

-- A signed-in user WITHOUT a profile (no role) must not read reference data
-- either. Previously these policies only required "authenticated".
drop policy "Authenticated users can read profiles" on public.profiles;
drop policy "Authenticated users can read recipes" on public.recipes;
drop policy "Authenticated users can read recipe components" on public.recipe_components;

create policy "Users with a role can read profiles"
  on public.profiles for select to authenticated
  using ((select public.current_app_role()) is not null);

create policy "Users with a role can read recipes"
  on public.recipes for select to authenticated
  using ((select public.current_app_role()) is not null);

create policy "Users with a role can read recipe components"
  on public.recipe_components for select to authenticated
  using ((select public.current_app_role()) is not null);
