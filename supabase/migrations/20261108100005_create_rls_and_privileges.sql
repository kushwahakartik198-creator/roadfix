-- RoadFix Phase 2A: Migration 5 of 8
-- Row Level Security and Principle-of-Least-Privilege Grants

-- 1. Revoke all default table privileges from anon, authenticated, and public on application tables
revoke all on public.profiles from public, anon, authenticated;
revoke all on public.user_roles from public, anon, authenticated;
revoke all on public.complaints from public, anon, authenticated;
revoke all on public.complaint_images from public, anon, authenticated;
revoke all on public.complaint_status_history from public, anon, authenticated;
revoke all on public.admin_audit_log from public, anon, authenticated;

-- 2. Enable Row Level Security (RLS) on all application tables
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.complaints enable row level security;
alter table public.complaint_images enable row level security;
alter table public.complaint_status_history enable row level security;
alter table public.admin_audit_log enable row level security;

-- 3. Grant SELECT privileges
-- Note: Sensitive foreign keys (reporter_id, uploaded_by) are explicitly excluded from SELECT grants.
-- Clients must specify explicit column names; `select *` queries will be rejected by PostgreSQL.

-- Table: profiles
grant select on public.profiles to authenticated;

-- Table: user_roles
grant select on public.user_roles to authenticated;

-- Table: complaints (EXCLUDES reporter_id)
grant select (
  id, reference, description, latitude, longitude, location_description,
  city_code, city_name, status, status_updated_at, severity,
  assigned_officer_id, assigned_at, rejection_reason, resolution_note,
  resolved_at, created_at, updated_at
) on public.complaints to authenticated;

-- Table: complaint_images (EXCLUDES uploaded_by)
grant select (
  id, complaint_id, kind, slot, storage_path, content_type, size_bytes, created_at
) on public.complaint_images to authenticated;

-- Table: complaint_status_history
grant select on public.complaint_status_history to authenticated;

-- Table: admin_audit_log
grant select on public.admin_audit_log to authenticated;

-- 4. RLS SELECT Policies

-- Profiles: users can only view their own profile
create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

-- User roles: users can view their own role; admins can view all roles
create policy user_roles_select on public.user_roles
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or private.current_app_role() = 'admin'::public.app_role
  );

-- Complaints: visibility governed by private.can_view_complaint()
-- (Reporter sees own; Officer sees submitted/under_review/verified or assigned; Admin sees all)
create policy complaints_select on public.complaints
  for select to authenticated
  using (private.can_view_complaint(id));

-- Complaint images: visibility inherits from complaint visibility
create policy complaint_images_select on public.complaint_images
  for select to authenticated
  using (private.can_view_complaint(complaint_id));

-- Complaint status history: staff only (officer or admin) AND must be allowed to view the complaint
create policy complaint_status_history_select on public.complaint_status_history
  for select to authenticated
  using (
    private.current_app_role() in ('officer'::public.app_role, 'admin'::public.app_role)
    and private.can_view_complaint(complaint_id)
  );

-- Admin audit log: strictly admins only
create policy admin_audit_log_select on public.admin_audit_log
  for select to authenticated
  using (private.current_app_role() = 'admin'::public.app_role);
