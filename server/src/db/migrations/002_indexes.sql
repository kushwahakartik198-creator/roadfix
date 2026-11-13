CREATE INDEX IF NOT EXISTS users_role_created_idx ON users(role, created_at);
CREATE INDEX IF NOT EXISTS officers_ward_active_idx ON officers(ward_id, active);
CREATE INDEX IF NOT EXISTS complaints_ward_status_created_idx ON complaints(ward_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS complaints_status_created_idx ON complaints(status, created_at DESC);
CREATE INDEX IF NOT EXISTS complaints_assigned_status_idx ON complaints(assigned_officer_id, status)
  WHERE assigned_officer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS complaints_reporter_created_idx ON complaints(reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS complaint_images_complaint_idx ON complaint_images(complaint_id);
CREATE INDEX IF NOT EXISTS complaint_history_complaint_created_idx
  ON complaint_status_history(complaint_id, created_at);
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_created_idx ON admin_audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_complaint_created_idx
  ON admin_audit_log(target_complaint_id, created_at DESC);
