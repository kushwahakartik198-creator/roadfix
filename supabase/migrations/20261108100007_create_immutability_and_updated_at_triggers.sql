-- RoadFix Phase 2A: Migration 7 of 8
-- Immutability and Updated-At Triggers

-- 1. Timestamp management: set_updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- Attach updated_at triggers
drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_complaints_updated_at on public.complaints;
create trigger trg_complaints_updated_at
  before update on public.complaints
  for each row execute function public.set_updated_at();

-- 2. Immutability guard for complaint_status_history
create or replace function public.enforce_complaint_status_history_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'complaint_status_history rows cannot be deleted' using errcode = '42501';
  elsif tg_op = 'UPDATE' then
    -- Allow UPDATE only when an auth user deletion cascades ON DELETE SET NULL to actor_id or assignee_id
    if (
      old.id = new.id
      and old.complaint_id = new.complaint_id
      and old.event_type = new.event_type
      and old.from_status is not distinct from new.from_status
      and old.to_status is not distinct from new.to_status
      and old.actor_role = new.actor_role
      and old.note is not distinct from new.note
      and old.created_at = new.created_at
      and (old.actor_id is not distinct from new.actor_id or (old.actor_id is not null and new.actor_id is null))
      and (old.assignee_id is not distinct from new.assignee_id or (old.assignee_id is not null and new.assignee_id is null))
    ) then
      return new;
    else
      raise exception 'complaint_status_history is immutable and cannot be modified' using errcode = '42501';
    end if;
  end if;
  return null;
end;
$$;

revoke execute on function public.enforce_complaint_status_history_immutability() from public, anon, authenticated;

drop trigger if exists trg_complaint_status_history_immutability on public.complaint_status_history;
create trigger trg_complaint_status_history_immutability
  before update or delete on public.complaint_status_history
  for each row execute function public.enforce_complaint_status_history_immutability();

-- 3. Immutability guard for admin_audit_log
create or replace function public.enforce_admin_audit_log_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'admin_audit_log rows cannot be deleted' using errcode = '42501';
  elsif tg_op = 'UPDATE' then
    -- Allow UPDATE only when foreign keys are set to NULL via ON DELETE SET NULL cascade
    if (
      old.id = new.id
      and old.action = new.action
      and old.details is not distinct from new.details
      and old.created_at = new.created_at
      and (old.admin_id is not distinct from new.admin_id or (old.admin_id is not null and new.admin_id is null))
      and (old.target_user_id is not distinct from new.target_user_id or (old.target_user_id is not null and new.target_user_id is null))
      and (old.target_complaint_id is not distinct from new.target_complaint_id or (old.target_complaint_id is not null and new.target_complaint_id is null))
    ) then
      return new;
    else
      raise exception 'admin_audit_log is immutable and cannot be modified' using errcode = '42501';
    end if;
  end if;
  return null;
end;
$$;

revoke execute on function public.enforce_admin_audit_log_immutability() from public, anon, authenticated;

drop trigger if exists trg_admin_audit_log_immutability on public.admin_audit_log;
create trigger trg_admin_audit_log_immutability
  before update or delete on public.admin_audit_log
  for each row execute function public.enforce_admin_audit_log_immutability();
