-- RoadFix Phase 2A: Migration 4 of 8
-- Signup Trigger on auth.users

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 1. Create default profile (display_name is null until user sets it)
  insert into public.profiles (id, display_name, created_at, updated_at)
  values (new.id, null, now(), now());

  -- 2. Assign default 'citizen' role ALWAYS, ignoring all metadata for security
  insert into public.user_roles (user_id, role, granted_by, granted_at)
  values (new.id, 'citizen'::public.app_role, null, now());

  return new;
end;
$$;

-- Revoke direct execution from end users
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Grant execution to supabase_auth_admin, which executes this trigger during auth signup
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- Attach trigger to auth.users table
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
