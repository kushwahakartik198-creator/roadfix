-- RoadFix Phase 2A: pgTAP Test Suite 2 of 4
-- Row Level Security, Grants, Column-Level Privileges, Direct DML Denial, and Role Separation

begin;
select plan(38);

-- 1. Verify RLS is enabled on all 6 application tables
select table_rls_enabled('public', 'profiles', 'profiles has RLS enabled');
select table_rls_enabled('public', 'user_roles', 'user_roles has RLS enabled');
select table_rls_enabled('public', 'complaints', 'complaints has RLS enabled');
select table_rls_enabled('public', 'complaint_images', 'complaint_images has RLS enabled');
select table_rls_enabled('public', 'complaint_status_history', 'complaint_status_history has RLS enabled');
select table_rls_enabled('public', 'admin_audit_log', 'admin_audit_log has RLS enabled');

-- 2. Create test fixtures inside transaction
-- Create test auth users
insert into auth.users (id, email, raw_user_meta_data)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'citizena@example.invalid', '{"role":"admin"}'::jsonb),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'citizenb@example.invalid', '{}'::jsonb),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'officer1@example.invalid', '{}'::jsonb),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'officer2@example.invalid', '{}'::jsonb),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'admin1@example.invalid', '{}'::jsonb);

-- Verify handle_new_user assigned 'citizen' to user A despite user_metadata claiming 'admin'
select is(
  (select role from public.user_roles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'citizen'::public.app_role,
  'Signup trigger assigns citizen role ignoring metadata injection'
);

-- Elevate officers and admin
update public.user_roles set role = 'officer'::public.app_role where user_id in ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'dddddddd-dddd-dddd-dddd-dddddddddddd');
update public.user_roles set role = 'admin'::public.app_role where user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

-- Insert complaints fixture (all references use 0123456789ABCDEFGHJKMNPQRSTVWXYZ)
insert into public.complaints (
  id, reference, reporter_id, description, latitude, longitude, status, assigned_officer_id
) values
  ('11111111-0000-0000-0000-000000000001', 'RF-AG-2026A001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Complaint by Citizen A', 27.18, 78.02, 'submitted', null),
  ('22222222-0000-0000-0000-000000000002', 'RF-AG-2026B001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Complaint by Citizen B', 27.19, 78.03, 'submitted', null),
  ('33333333-0000-0000-0000-000000000003', 'RF-AG-SEC10001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Assigned to Officer 1', 27.20, 78.04, 'in_progress', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  ('44444444-0000-0000-0000-000000000004', 'RF-AG-SEC20001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Assigned to Officer 2', 27.21, 78.05, 'in_progress', 'dddddddd-dddd-dddd-dddd-dddddddddddd');

-- 3. Impersonate Citizen A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);

-- Citizen A sees own complaint
select results_eq(
  $$ select reference from public.complaints $$,
  $$ values ('RF-AG-2026A001'::text) $$,
  'Citizen A sees only their own complaint'
);

-- Direct DML Denial Across All Six Application Tables (Finding 10)
-- 1. profiles
select throws_ok(
  $$ insert into public.profiles (id, display_name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Hacker') $$,
  '42501',
  null,
  'Direct INSERT on profiles is rejected (42501)'
);
select throws_ok(
  $$ update public.profiles set display_name = 'Hacked' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501',
  null,
  'Direct UPDATE on profiles is rejected (42501)'
);
select throws_ok(
  $$ delete from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501',
  null,
  'Direct DELETE on profiles is rejected (42501)'
);

-- 2. user_roles
select throws_ok(
  $$ insert into public.user_roles (user_id, role) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin') $$,
  '42501',
  null,
  'Direct INSERT on user_roles is rejected (42501)'
);
select throws_ok(
  $$ update public.user_roles set role = 'admin' where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501',
  null,
  'Direct UPDATE on user_roles is rejected (42501)'
);
select throws_ok(
  $$ delete from public.user_roles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501',
  null,
  'Direct DELETE on user_roles is rejected (42501)'
);

-- 3. complaints
select throws_ok(
  $$ insert into public.complaints (reference, description, latitude, longitude) values ('RF-AG-BAD10001', 'Direct insert fail', 27.18, 78.02) $$,
  '42501',
  null,
  'Direct INSERT on complaints is rejected (42501)'
);
select throws_ok(
  $$ update public.complaints set description = 'Hacked' where id = '11111111-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'Direct UPDATE on complaints is rejected (42501)'
);
select throws_ok(
  $$ delete from public.complaints where id = '11111111-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'Direct DELETE on complaints is rejected (42501)'
);

-- 4. complaint_images
select throws_ok(
  $$ insert into public.complaint_images (complaint_id, kind, storage_path, content_type, size_bytes) values ('11111111-0000-0000-0000-000000000001', 'report', '11111111-0000-0000-0000-000000000001/report/11111111-0000-0000-0000-000000000001.jpg', 'image/jpeg', 1000) $$,
  '42501',
  null,
  'Direct INSERT on complaint_images is rejected (42501)'
);
select throws_ok(
  $$ update public.complaint_images set size_bytes = 2000 where complaint_id = '11111111-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'Direct UPDATE on complaint_images is rejected (42501)'
);
select throws_ok(
  $$ delete from public.complaint_images where complaint_id = '11111111-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'Direct DELETE on complaint_images is rejected (42501)'
);

-- 5. complaint_status_history
select throws_ok(
  $$ insert into public.complaint_status_history (complaint_id, event_type, actor_role) values ('11111111-0000-0000-0000-000000000001', 'created', 'citizen') $$,
  '42501',
  null,
  'Direct INSERT on complaint_status_history is rejected (42501)'
);
select throws_ok(
  $$ update public.complaint_status_history set note = 'Hacked' where complaint_id = '11111111-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'Direct UPDATE on complaint_status_history is rejected (42501)'
);
select throws_ok(
  $$ delete from public.complaint_status_history where complaint_id = '11111111-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'Direct DELETE on complaint_status_history is rejected (42501)'
);

-- 6. admin_audit_log
select throws_ok(
  $$ insert into public.admin_audit_log (action) values ('fake_audit') $$,
  '42501',
  null,
  'Direct INSERT on admin_audit_log is rejected (42501)'
);
select throws_ok(
  $$ update public.admin_audit_log set action = 'modified' $$,
  '42501',
  null,
  'Direct UPDATE on admin_audit_log is rejected (42501)'
);
select throws_ok(
  $$ delete from public.admin_audit_log $$,
  '42501',
  null,
  'Direct DELETE on admin_audit_log is rejected (42501)'
);

-- Citizen History Test (Finding 9: SELECT is granted, RLS filters rows to 0)
select is(
  (select count(*)::integer from public.complaint_status_history),
  0,
  'Citizen sees zero rows from complaint_status_history due to RLS filtering'
);

-- 4. Impersonate Officer 1
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true);

-- select * on complaints must fail because reporter_id is not granted
select throws_ok(
  $$ select * from public.complaints $$,
  '42501',
  null,
  'select * on complaints fails for authenticated because reporter_id is excluded'
);

-- Named columns work for Officer 1
select lives_ok(
  $$ select id, reference, description, status, assigned_officer_id from public.complaints $$,
  'Selecting explicitly granted columns on complaints succeeds'
);

-- Selecting reporter_id fails
select throws_ok(
  $$ select reporter_id from public.complaints $$,
  '42501',
  null,
  'Selecting reporter_id on complaints is forbidden (42501)'
);

-- Selecting uploaded_by on complaint_images fails
select throws_ok(
  $$ select uploaded_by from public.complaint_images $$,
  '42501',
  null,
  'Selecting uploaded_by on complaint_images is forbidden (42501)'
);

-- Officer 1 sees submitted complaints plus own assigned in_progress, NOT Officer 2 in_progress
select results_eq(
  $$ select reference from public.complaints order by reference $$,
  $$ values ('RF-AG-2026A001'::text), ('RF-AG-2026B001'::text), ('RF-AG-SEC10001'::text) $$,
  'Officer sees submitted complaints and own assigned in_progress, excluding other officers assigned in_progress'
);

-- 5. Function execution privileges check
-- Authenticated cannot execute handle_new_user directly
select throws_ok(
  $$ select public.handle_new_user() $$,
  '42501',
  null,
  'Authenticated cannot execute handle_new_user() directly'
);

-- Authenticated cannot execute private.generate_complaint_reference directly (Finding 5)
select throws_ok(
  $$ select private.generate_complaint_reference('AG') $$,
  '42501',
  null,
  'Authenticated cannot execute private.generate_complaint_reference directly'
);

-- 6. Switch to anon
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

-- Anon cannot read application tables
select throws_ok(
  $$ select count(*) from public.complaints $$,
  '42501',
  null,
  'Anon cannot read complaints'
);

select throws_ok(
  $$ select public.submit_complaint('Description text test', 27.18, 78.02) $$,
  '42501',
  null,
  'Anon cannot call submit_complaint'
);

-- Anon CAN execute track_complaint
select lives_ok(
  $$ select * from public.track_complaint('RF-AG-2026A001') $$,
  'Anon can execute track_complaint'
);

-- 7. Reset to postgres and verify Supabase-managed policies
set local role postgres;

-- Confirm only roadfix_* policies exist on storage.objects from our migrations
select is(
  (select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'roadfix_%'),
  3,
  'Exactly 3 roadfix_* policies exist on storage.objects'
);

select * from finish();
rollback;
