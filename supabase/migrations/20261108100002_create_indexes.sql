-- RoadFix Phase 2A: Migration 2 of 8
-- Performance and Integrity Indexes

-- 1. Complaints indexes
create index complaints_reporter_created_idx on public.complaints (reporter_id, created_at desc);
create index complaints_status_created_idx on public.complaints (status, created_at desc);
create index complaints_assigned_officer_status_idx on public.complaints (assigned_officer_id, status) where assigned_officer_id is not null;
create index complaints_lat_lng_idx on public.complaints (latitude, longitude);

-- 2. Complaint images indexes
create index complaint_images_complaint_id_idx on public.complaint_images (complaint_id);

-- Hard, race-proof cap of 3 report images per complaint (enforced at the DB engine level)
create unique index complaint_images_report_slot_uidx on public.complaint_images (complaint_id, slot) where kind = 'report';

-- 3. Complaint status history index
create index complaint_status_history_complaint_created_idx on public.complaint_status_history (complaint_id, created_at);

-- 4. Admin audit log index
create index admin_audit_log_admin_created_idx on public.admin_audit_log (admin_id, created_at desc);
create index admin_audit_log_target_complaint_idx on public.admin_audit_log (target_complaint_id) where target_complaint_id is not null;
create index admin_audit_log_target_user_idx on public.admin_audit_log (target_user_id) where target_user_id is not null;
