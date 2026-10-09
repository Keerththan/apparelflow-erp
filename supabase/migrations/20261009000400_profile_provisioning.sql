-- Create a public.profiles row whenever a Supabase Auth user is created.
--
-- The role is read from raw_app_meta_data, which only the service role /
-- dashboard can set. raw_user_meta_data is user-editable (supabase.auth
-- .updateUser) and must never be trusted for authorization.
-- A user without a valid role cannot be created at all, so a public
-- sign-up cannot produce an account with access to the terminal.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
begin
  if v_role is null
     or v_role not in ('cutting_supervisor', 'cutting_verifier', 'sewing_supervisor') then
    raise exception 'User % has no valid app_metadata.role', new.email
      using errcode = 'AF403';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), new.email),
    v_role::public.app_role
  );

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
