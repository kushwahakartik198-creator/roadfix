-- RoadFix Phase 2A: pgTAP Test Suite 4 of 4
-- Storage Policies, Image Registration, Immutability, and User Deletion Cascade Preservation

begin;
select plan(27);

-- 1. Fixture setup
insert into auth.users (id, email)
values
  ('11111111-2222-3333-4444-555555555555', 'reporter@example.invalid'),
  ('22222222-3333-4444-5555-666666666666', 'officer@example.invalid'),
  ('33333333-4444-5555-6666-777777777777', 'stranger@example.invalid'),
  ('44444444-5555-6666-7777-888888888888', 'admin@example.invalid'),
  ('55555555-6666-7777-8888-999999999999', 'targetuser@example.invalid');

update public.user_roles set role = 'citizen'::public.app_role where user_id in ('11111111-2222-3333-4444-555555555555', '33333333-4444-5555-6666-777777777777', '55555555-6666-7777-8888-999999999999');
update public.user_roles set role = 'officer'::public.app_role where user_id = '22222222-3333-4444-5555-666666666666';
update public.user_roles set role = 'admin'::public.app_role where user_id = '44444444-5555-6666-7777-888888888888';

-- Valid reference format using 0123456789ABCDEFGHJKMNPQRSTVWXYZ (Finding 8)
insert into public.complaints (
  id, reference, reporter_id, description, latitude, longitude, status, assigned_officer_id
) values (
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'RF-AG-PHT10001',
  '11111111-2222-3333-4444-555555555555',
  'Complaint for image and storage testing',
  27.18,
  78.02,
  'submitted',
  '22222222-3333-4444-5555-666666666666'
);

-- Insert storage objects with owner_id field (Finding 1)
insert into storage.objects (
  id, bucket_id, name, owner_id, metadata
) values
  ('11111111-0000-0000-0000-000000000001', 'complaint-images', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/report/11111111-0000-0000-0000-000000000001.jpg', '11111111-2222-3333-4444-555555555555', '{"size": 150000, "mimetype": "image/jpeg"}'::jsonb),
  ('11111111-0000-0000-0000-000000000002', 'complaint-images', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/report/11111111-0000-0000-0000-000000000002.jpg', '11111111-2222-3333-4444-555555555555', '{"size": 160000, "mimetype": "image/jpeg"}'::jsonb),
  ('11111111-0000-0000-0000-000000000003', 'complaint-images', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/report/11111111-0000-0000-0000-000000000003.jpg', '11111111-2222-3333-4444-555555555555', '{"size": 170000, "mimetype": "image/jpeg"}'::jsonb),
  ('11111111-0000-0000-0000-000000000004', 'complaint-images', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/report/11111111-0000-0000-0000-000000000004.jpg', '11111111-2222-3333-4444-555555555555', '{"size": 180000, "mimetype": "image/jpeg"}'::jsonb),
  ('11111111-0000-0000-0000-000000000005', 'complaint-images', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/report/11111111-0000-0000-0000-000000000005.jpg', null, '{"size": 150000, "mimetype": "image/jpeg"}'::jsonb),
  ('11111111-0000-0000-0000-000000000006', 'complaint-images', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/report/11111111-0000-0000-0000-000000000006.jpg', '33333333-4444-5555-6666-777777777777', '{"size": 150000, "mimetype": "image/jpeg"}'::jsonb);

-- 2. Image registration RPC tests
-- Stranger cannot register images
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-4444-5555-6666-777777777777","role":"authenticated"}', true);
select throws_ok(
  $$ select public.register_complaint_image('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/report/11111111-0000-0000-0000-000000000001.jpg', 'report') $$,
  '42501',
  null,
  'Unrelated stranger cannot register image'
);

-- Reporter tries to register object with NULL owner_id (Finding 1 & 10)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-2222-3333-4444-555555555555","role":"authenticated"}', true);
select throws_ok(
  $$ select public.register_complaint_image('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/report/11111111-0000-0000-0000-000000000005.jpg', 'report') $$,
  '42501',
  null,
  'Registration with NULL owner_id throws 42501'
);

-- Reporter tries to register object owned by another user (Finding 1 & 10)
select throws_ok(
  $$ select public.register_complaint_image('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/report/11111111-0000-0000-0000-000000000006.jpg', 'report') $$,
  '42501',
  null,
  'Registration with mismatched owner_id throws 42501'
);

-- Reporter registers slot 1
select lives_ok(
  $$ select public.register_complaint_image('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/report/11111111-0000-0000-0000-000000000001.jpg', 'report') $$,
  'Reporter registers 1st report image'
);

-- Reporter registers slot 2
select lives_ok(
  $$ select public.register_complaint_image('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/report/11111111-0000-0000-0000-000000000002.jpg', 'report') $$,
  'Reporter registers 2nd report image'
);

-- Reporter registers slot 3
select lives_ok(
  $$ select public.register_complaint_image('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/report/11111111-0000-0000-0000-000000000003.jpg', 'report') $$,
  'Reporter registers 3rd report image'
);

-- Duplicate storage path registration is rejected
select throws_ok(
  $$ select public.register_complaint_image('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/report/11111111-0000-0000-0000-000000000003.jpg', 'report') $$,
  '23505',
  null,
  'Duplicate storage path registration fails'
);

-- 4th registration fails (slot limit reached)
select throws_ok(
  $$ select public.register_complaint_image('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/report/11111111-0000-0000-0000-000000000004.jpg', 'report') $$,
  'P0001',
  null,
  '4th report image registration fails with limit reached error'
);

-- Verify slots are 1, 2, 3
set local role postgres;
select is(
  (select count(*)::integer from public.complaint_images where complaint_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' and slot in (1, 2, 3)),
  3,
  'Exactly 3 complaint images registered in slots 1, 2, 3'
);

-- 3. Immutability checks on complaint_status_history
insert into public.complaint_status_history (
  complaint_id, event_type, from_status, to_status, assignee_id, actor_id, actor_role, note
) values (
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'status_change',
  'submitted',
  'under_review',
  '22222222-3333-4444-5555-666666666666',
  '22222222-3333-4444-5555-666666666666',
  'officer',
  'Under review note'
);

-- Direct DELETE on complaint_status_history is blocked even for postgres
select throws_ok(
  $$ delete from public.complaint_status_history where complaint_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' $$,
  '42501',
  null,
  'DELETE on complaint_status_history is blocked by immutability trigger'
);

-- Arbitrary UPDATE on complaint_status_history is blocked
select throws_ok(
  $$ update public.complaint_status_history set note = 'Modified note' where complaint_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' $$,
  '42501',
  null,
  'UPDATE on note in complaint_status_history is blocked by immutability trigger'
);

-- 4. Immutability checks on admin_audit_log
insert into public.admin_audit_log (id, admin_id, action, target_complaint_id, target_user_id)
values (1001, '44444444-5555-6666-7777-888888888888', 'test_audit_action', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '55555555-6666-7777-8888-999999999999');

select throws_ok(
  $$ delete from public.admin_audit_log where id = 1001 $$,
  '42501',
  null,
  'DELETE on admin_audit_log is blocked by immutability trigger'
);

select throws_ok(
  $$ update public.admin_audit_log set action = 'modified_action' where id = 1001 $$,
  '42501',
  null,
  'UPDATE on action in admin_audit_log is blocked by immutability trigger'
);

-- 5. User Deletion Preservation Tests (ON DELETE SET NULL)
-- Delete reporter user
select lives_ok(
  $$ delete from auth.users where id = '11111111-2222-3333-4444-555555555555' $$,
  'Deleting reporter auth user succeeds'
);

-- Complaint is PRESERVED, reporter_id is set to NULL
select is(
  (select count(*)::integer from public.complaints where id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  1,
  'Complaint is preserved after reporter user deletion'
);

select is(
  (select reporter_id from public.complaints where id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  null,
  'reporter_id was set to NULL on complaint'
);

-- Complaint images are PRESERVED, uploaded_by set to NULL
select is(
  (select count(*)::integer from public.complaint_images where complaint_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  3,
  'All 3 complaint images are preserved after reporter deletion'
);

select is(
  (select count(*)::integer from public.complaint_images where complaint_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' and uploaded_by is null),
  3,
  'uploaded_by is set to NULL on complaint images'
);

-- Delete officer user
select lives_ok(
  $$ delete from auth.users where id = '22222222-3333-4444-5555-666666666666' $$,
  'Deleting officer auth user succeeds'
);

-- History records are PRESERVED, actor_id and assignee_id set to NULL
select is(
  (select count(*)::integer from public.complaint_status_history where complaint_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  1,
  'History records are preserved after officer deletion'
);

select is(
  (select actor_id from public.complaint_status_history where complaint_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  null,
  'History actor_id was safely updated to NULL'
);

-- Delete target user referenced in admin_audit_log (Findings 3 & 10)
select lives_ok(
  $$ delete from auth.users where id = '55555555-6666-7777-8888-999999999999' $$,
  'Deleting target user referenced in admin_audit_log succeeds'
);

select is(
  (select count(*)::integer from public.admin_audit_log where id = 1001),
  1,
  'admin_audit_log row is preserved after target user deletion'
);

select is(
  (select target_user_id from public.admin_audit_log where id = 1001),
  null,
  'target_user_id was set to NULL in admin_audit_log'
);

-- Delete admin user referenced in admin_audit_log (Findings 3 & 10)
select lives_ok(
  $$ delete from auth.users where id = '44444444-5555-6666-7777-888888888888' $$,
  'Deleting admin user referenced in admin_audit_log succeeds'
);

select is(
  (select count(*)::integer from public.admin_audit_log where id = 1001),
  1,
  'admin_audit_log row is preserved after admin user deletion'
);

select is(
  (select admin_id from public.admin_audit_log where id = 1001),
  null,
  'admin_id was set to NULL in admin_audit_log'
);

select * from finish();
rollback;
