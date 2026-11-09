-- RoadFix Phase 2A: Migration 3 of 8
-- Private Schema and Security Definer Helper Functions

-- 1. Private schema (not exposed to PostgREST API)
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- 2. Helper: current_app_role()
create or replace function private.current_app_role()
returns public.app_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.app_role;
begin
  if v_uid is null then
    return 'citizen'::public.app_role;
  end if;

  select r.role into v_role
  from public.user_roles r
  where r.user_id = v_uid;

  return coalesce(v_role, 'citizen'::public.app_role);
end;
$$;

-- 3. Helper: is_reporter(p_complaint_id uuid)
create or replace function private.is_reporter(p_complaint_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or p_complaint_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.complaints c
    where c.id = p_complaint_id
      and c.reporter_id = v_uid
  );
end;
$$;

-- 4. Helper: is_assigned_officer(p_complaint_id uuid)
create or replace function private.is_assigned_officer(p_complaint_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or p_complaint_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.complaints c
    where c.id = p_complaint_id
      and c.assigned_officer_id = v_uid
  );
end;
$$;

-- 5. Helper: can_view_complaint(p_complaint_id uuid)
-- Rules:
-- - Reporter can view own complaint (reporter_id = auth.uid())
-- - Officer can view complaints in (submitted, under_review, verified) OR assigned to them
-- - Admin can view all complaints
create or replace function private.can_view_complaint(p_complaint_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.app_role;
begin
  if v_uid is null or p_complaint_id is null then
    return false;
  end if;

  v_role := private.current_app_role();

  if v_role = 'admin'::public.app_role then
    return true;
  end if;

  if v_role = 'officer'::public.app_role then
    return exists (
      select 1
      from public.complaints c
      where c.id = p_complaint_id
        and (
          c.status in ('submitted'::public.complaint_status, 'under_review'::public.complaint_status, 'verified'::public.complaint_status)
          or c.assigned_officer_id = v_uid
        )
    );
  end if;

  -- Default: citizen
  return exists (
    select 1
    from public.complaints c
    where c.id = p_complaint_id
      and c.reporter_id = v_uid
  );
end;
$$;

-- 6. Helper: count_report_storage_objects(p_complaint_id uuid)
-- Best-effort storage check for pre-validation in storage policies
create or replace function private.count_report_storage_objects(p_complaint_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_complaint_id is null then
    return 0;
  end if;

  select count(*)::integer into v_count
  from storage.objects o
  where o.bucket_id = 'complaint-images'
    and o.name like (p_complaint_id::text || '/report/%');

  return coalesce(v_count, 0);
end;
$$;

-- 7. Helper: generate_complaint_reference(p_city_code text)
-- Generates CSPRNG reference string: RF-<CITY>-<8 chars from 32-char alphabet>
-- Alphabet: 0123456789ABCDEFGHJKMNPQRSTVWXYZ (Base32 Crockford variant, no I, L, O, U)
-- Entropy: 32^8 = 2^40 (~1.1 trillion permutations)
create or replace function private.generate_complaint_reference(p_city_code text default 'AG')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea;
  v_suffix text;
  v_ref text;
  v_attempt integer := 0;
  i integer;
  v_idx integer;
begin
  while v_attempt < 5 loop
    v_attempt := v_attempt + 1;
    v_bytes := extensions.gen_random_bytes(8);
    v_suffix := '';
    for i in 0..7 loop
      -- Bitwise AND with 31 (0x1F) selects 0..31 with zero modulo bias
      v_idx := (get_byte(v_bytes, i) & 31);
      v_suffix := v_suffix || substr(c_alphabet, v_idx + 1, 1);
    end loop;

    v_ref := 'RF-' || coalesce(p_city_code, 'AG') || '-' || v_suffix;

    if not exists (select 1 from public.complaints where reference = v_ref) then
      return v_ref;
    end if;
  end loop;

  raise exception 'Could not generate unique complaint reference after 5 attempts' using errcode = 'P0001';
end;
$$;

-- Privilege configuration
revoke execute on function private.current_app_role() from public, anon, authenticated;
grant execute on function private.current_app_role() to authenticated;

revoke execute on function private.is_reporter(uuid) from public, anon, authenticated;
grant execute on function private.is_reporter(uuid) to authenticated;

revoke execute on function private.is_assigned_officer(uuid) from public, anon, authenticated;
grant execute on function private.is_assigned_officer(uuid) to authenticated;

revoke execute on function private.can_view_complaint(uuid) from public, anon, authenticated;
grant execute on function private.can_view_complaint(uuid) to authenticated;

revoke execute on function private.count_report_storage_objects(uuid) from public, anon, authenticated;
grant execute on function private.count_report_storage_objects(uuid) to authenticated;

revoke execute on function private.generate_complaint_reference(text) from public, anon, authenticated;
