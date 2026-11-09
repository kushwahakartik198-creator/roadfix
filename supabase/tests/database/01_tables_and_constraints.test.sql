-- RoadFix Phase 2A: pgTAP Test Suite 1 of 4
-- Tables, Constraints, Types, and Index Verification

begin;
select plan(28);

-- 1. Check schemas
select has_schema('public', 'public schema exists');
select has_schema('private', 'private schema exists');

-- 2. Check enums
select has_type('public', 'app_role', 'app_role enum exists');
select has_type('public', 'complaint_status', 'complaint_status enum exists');
select has_type('public', 'severity_level', 'severity_level enum exists');
select has_type('public', 'image_kind', 'image_kind enum exists');
select has_type('public', 'history_event', 'history_event enum exists');

-- 3. Check application tables exist
select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'user_roles', 'user_roles table exists');
select has_table('public', 'complaints', 'complaints table exists');
select has_table('public', 'complaint_images', 'complaint_images table exists');
select has_table('public', 'complaint_status_history', 'complaint_status_history table exists');
select has_table('public', 'admin_audit_log', 'admin_audit_log table exists');

-- 4. Check Primary Keys
select col_is_pk('public', 'profiles', 'id', 'profiles.id is PK');
select col_is_pk('public', 'user_roles', 'user_id', 'user_roles.user_id is PK');
select col_is_pk('public', 'complaints', 'id', 'complaints.id is PK');
select col_is_pk('public', 'complaint_images', 'id', 'complaint_images.id is PK');
select col_is_pk('public', 'complaint_status_history', 'id', 'complaint_status_history.id is PK');
select col_is_pk('public', 'admin_audit_log', 'id', 'admin_audit_log.id is PK');

-- 5. Check Indexes
select has_index('public', 'complaints', 'complaints_reporter_created_idx', 'complaints reporter index exists');
select has_index('public', 'complaints', 'complaints_status_created_idx', 'complaints status index exists');
select has_index('public', 'complaints', 'complaints_lat_lng_idx', 'complaints lat/lng index exists');
select has_index('public', 'complaint_images', 'complaint_images_report_slot_uidx', 'complaint_images partial unique slot index exists');
select has_index('public', 'complaint_status_history', 'complaint_status_history_complaint_created_idx', 'history complaint index exists');

-- 6. Verify Reference Generator
select matches(
  private.generate_complaint_reference('AG'),
  '^RF-AG-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$',
  'Generated reference matches RoadFix format exactly'
);

-- 7. Verify Unique Partial Index on complaint_images (complaint_id, slot) WHERE kind = 'report'
-- Inserting duplicate slot for kind 'report' must throw unique_violation
prepare test_dup_slot as
  insert into public.complaint_images (
    id, complaint_id, uploaded_by, kind, slot, storage_path, content_type, size_bytes, created_at
  ) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', null, 'report', 1, '00000000-0000-0000-0000-000000000001/report/11111111-1111-1111-1111-111111111111.jpg', 'image/jpeg', 1000, now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000001', null, 'report', 1, '00000000-0000-0000-0000-000000000001/report/22222222-2222-2222-2222-222222222222.jpg', 'image/jpeg', 1000, now());

-- First insert complaint fixture for foreign key
insert into public.complaints (
  id, reference, description, latitude, longitude, status, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000001',
  'RF-AG-TEST0001',
  'Pothole near test location for index verification',
  27.180000,
  78.020000,
  'submitted',
  now(),
  now()
);

select throws_ok(
  'test_dup_slot',
  '23505',
  null,
  'Inserting duplicate slot for kind report throws 23505 unique violation'
);

-- 8. Verify Latitude and Longitude Range Check Constraints (-90 to 90 and -180 to 180)
select throws_ok(
  $$ insert into public.complaints (reference, description, latitude, longitude) values ('RF-AG-TEST0002', 'Out of bounds lat', 95.000000, 78.000000) $$,
  '23514',
  null,
  'Latitude outside bounds (-90 to 90) throws check violation'
);

select throws_ok(
  $$ insert into public.complaints (reference, description, latitude, longitude) values ('RF-AG-TEST0003', 'Out of bounds lng', 27.150000, 185.000000) $$,
  '23514',
  null,
  'Longitude outside bounds (-180 to 180) throws check violation'
);

select * from finish();
rollback;
