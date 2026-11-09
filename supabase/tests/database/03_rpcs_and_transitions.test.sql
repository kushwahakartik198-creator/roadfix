-- RoadFix Phase 2A: pgTAP Test Suite 3 of 4
-- RPCs, State Transitions, Rate Limiting, and Admin Workflows

begin;
select plan(27);

-- 1. Setup test users and roles
insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'citizen@example.invalid'),
  ('22222222-2222-2222-2222-222222222222', 'officer_a@example.invalid'),
  ('33333333-3333-3333-3333-333333333333', 'officer_b@example.invalid'),
  ('44444444-4444-4444-4444-444444444444', 'admin_a@example.invalid'),
  ('55555555-5555-5555-5555-555555555555', 'admin_b@example.invalid');

update public.user_roles set role = 'citizen'::public.app_role where user_id = '11111111-1111-1111-1111-111111111111';
update public.user_roles set role = 'officer'::public.app_role where user_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
update public.user_roles set role = 'admin'::public.app_role where user_id in ('44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555');

-- 2. submit_complaint validation
-- Impersonate citizen
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- Reject out-of-bounds coordinates (-90 to 90 for lat, -180 to 180 for lng)
select throws_ok(
  $$ select * from public.submit_complaint('Valid description text', 95.00, 78.00) $$,
  '22000',
  null,
  'submit_complaint rejects latitude outside -90 to 90'
);

select throws_ok(
  $$ select * from public.submit_complaint('Valid description text', 27.18, 185.00) $$,
  '22000',
  null,
  'submit_complaint rejects longitude outside -180 to 180'
);

-- Reject '@' in location description
select throws_ok(
  $$ select * from public.submit_complaint('Valid description text', 27.18, 78.02, 'Contact me at test@example.com') $$,
  '22000',
  null,
  'submit_complaint rejects @ symbol in location_description'
);

-- Reject 7+ consecutive digits in location description
select throws_ok(
  $$ select * from public.submit_complaint('Valid description text', 27.18, 78.02, 'Call 9876543210 for details') $$,
  '22000',
  null,
  'submit_complaint rejects phone numbers in location_description'
);

-- Successful submission
prepare do_submit as select id, reference from public.submit_complaint('Deep pothole on MG Road near civil lines', 27.18, 78.02, 'Near main junction');
select lives_ok('do_submit', 'Citizen submits complaint successfully');

-- Verify rate limiting: 10 per 24 hours
-- Insert 9 more complaints directly as postgres for the user using valid Crockford Base32 references
set local role postgres;
insert into public.complaints (reference, reporter_id, description, latitude, longitude, created_at)
select
  'RF-AG-BK' || lpad(g::text, 6, '0'),
  '11111111-1111-1111-1111-111111111111',
  'Pothole description for bulk rate limit testing',
  27.18,
  78.02,
  now()
from generate_series(1, 9) g;

-- 11th complaint within 24h must fail
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.submit_complaint('11th complaint in 24 hours', 27.18, 78.02) $$,
  'P0001',
  null,
  '11th complaint within 24 hours is rejected by rate limiter'
);

-- Backdate rows outside 24h window
set local role postgres;
update public.complaints
set created_at = now() - interval '25 hours'
where reporter_id = '11111111-1111-1111-1111-111111111111';

-- Now submission should succeed again
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.submit_complaint('Submission after window clears', 27.18, 78.02) $$,
  'Submission succeeds after 24-hour rate limit window clears'
);

-- 3. State transitions
set local role postgres;
insert into public.complaints (id, reference, reporter_id, description, latitude, longitude, status)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'RF-AG-TRNS0001', '11111111-1111-1111-1111-111111111111', 'Transition test complaint', 27.18, 78.02, 'submitted');

-- Citizen cannot transition status
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select throws_ok(
  $$ select public.transition_complaint_status('aaaaaaaa-0000-0000-0000-000000000001', 'under_review') $$,
  '42501',
  null,
  'Citizens cannot transition status'
);

-- Officer A transitions submitted -> under_review
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select lives_ok(
  $$ select public.transition_complaint_status('aaaaaaaa-0000-0000-0000-000000000001', 'under_review') $$,
  'Officer can transition submitted -> under_review'
);

-- under_review -> verified requires severity
select throws_ok(
  $$ select public.transition_complaint_status('aaaaaaaa-0000-0000-0000-000000000001', 'verified') $$,
  'P0001',
  null,
  'under_review -> verified fails when severity is missing'
);

-- under_review -> verified with severity succeeds
select lives_ok(
  $$ select public.transition_complaint_status('aaaaaaaa-0000-0000-0000-000000000001', 'verified', null, 'high'::public.severity_level) $$,
  'under_review -> verified succeeds with severity'
);

-- verified -> in_progress fails if assigned_officer_id is not set
select throws_ok(
  $$ select public.transition_complaint_status('aaaaaaaa-0000-0000-0000-000000000001', 'in_progress') $$,
  'P0001',
  null,
  'verified -> in_progress fails without assigned officer'
);

-- 4. assign_complaint
-- Officer cannot assign complaints
select throws_ok(
  $$ select public.assign_complaint('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222') $$,
  '42501',
  null,
  'Officer cannot assign complaints'
);

-- Admin assigns complaint to Officer A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select lives_ok(
  $$ select public.assign_complaint('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222') $$,
  'Admin assigns complaint to Officer A'
);

-- Officer B cannot start in_progress on Officer A complaint
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select throws_ok(
  $$ select public.transition_complaint_status('aaaaaaaa-0000-0000-0000-000000000001', 'in_progress') $$,
  '42501',
  null,
  'Unassigned Officer B cannot start work on Officer A complaint'
);

-- Officer A starts work verified -> in_progress
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select lives_ok(
  $$ select public.transition_complaint_status('aaaaaaaa-0000-0000-0000-000000000001', 'in_progress') $$,
  'Assigned Officer A starts in_progress'
);

-- in_progress -> resolved requires resolution note
select throws_ok(
  $$ select public.transition_complaint_status('aaaaaaaa-0000-0000-0000-000000000001', 'resolved') $$,
  'P0001',
  null,
  'in_progress -> resolved fails without resolution note'
);

-- in_progress -> resolved succeeds with note
select lives_ok(
  $$ select public.transition_complaint_status('aaaaaaaa-0000-0000-0000-000000000001', 'resolved', 'Pothole asphalt patched and compacted') $$,
  'in_progress -> resolved succeeds with resolution note'
);

-- Officer cannot reopen resolved complaint
select throws_ok(
  $$ select public.transition_complaint_status('aaaaaaaa-0000-0000-0000-000000000001', 'in_progress', 'Reopen attempt') $$,
  '42501',
  null,
  'Officer cannot reopen resolved complaint'
);

-- Admin reopens resolved complaint into in_progress
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select lives_ok(
  $$ select public.transition_complaint_status('aaaaaaaa-0000-0000-0000-000000000001', 'in_progress', 'Citizen reported asphalt cracking again') $$,
  'Admin reopens resolved complaint'
);

-- Verify reopened history event recorded
set local role postgres;
select is(
  (select event_type from public.complaint_status_history where complaint_id = 'aaaaaaaa-0000-0000-0000-000000000001' order by id desc limit 1),
  'reopened'::public.history_event,
  'Reopened event recorded in complaint status history'
);

-- 5. admin_set_role and last-admin demotion prevention
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);

-- Admin demotes Admin B to officer (succeeds because Admin A remains)
select lives_ok(
  $$ select public.admin_set_role('55555555-5555-5555-5555-555555555555', 'officer') $$,
  'Admin A demotes Admin B when multiple admins exist'
);

-- Admin A attempts to demote self (fails: last admin)
select throws_ok(
  $$ select public.admin_set_role('44444444-4444-4444-4444-444444444444', 'citizen') $$,
  'P0001',
  null,
  'Demoting the last remaining admin is blocked'
);

-- 6. admin_get_reporter
select lives_ok(
  $$ select * from public.admin_get_reporter('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'Admin calls admin_get_reporter successfully'
);

-- 7. track_complaint as anon returns public D6 fields only
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select count(*)::integer from public.track_complaint('RF-AG-TRNS0001')),
  1,
  'track_complaint returns valid complaint for correct reference'
);

-- Unknown reference using valid Crockford Base32 format (Finding 8)
select is(
  (select count(*)::integer from public.track_complaint('RF-AG-99999999')),
  0,
  'track_complaint returns empty result for unknown reference'
);

-- Malformed reference
select is(
  (select count(*)::integer from public.track_complaint('INVALID-FORMAT')),
  0,
  'track_complaint returns empty result for malformed reference'
);

select * from finish();
rollback;
