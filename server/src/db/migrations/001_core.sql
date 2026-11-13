CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY CHECK(length(trim(id)) BETWEEN 1 AND 100),
  email TEXT COLLATE NOCASE UNIQUE CHECK(email IS NULL OR length(trim(email)) BETWEEN 3 AND 254),
  role TEXT NOT NULL CHECK(role IN ('citizen','officer','admin')),
  display_name TEXT CHECK(display_name IS NULL OR length(trim(display_name)) BETWEEN 1 AND 120),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wards (
  id TEXT PRIMARY KEY CHECK(length(trim(id)) BETWEEN 1 AND 100),
  code TEXT NOT NULL UNIQUE CHECK(length(trim(code)) BETWEEN 1 AND 16),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
  description TEXT CHECK(description IS NULL OR length(description) <= 500),
  latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),
  ward_number TEXT NOT NULL CHECK(length(trim(ward_number)) BETWEEN 1 AND 20),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS officers (
  id TEXT PRIMARY KEY CHECK(length(trim(id)) BETWEEN 1 AND 100),
  user_id TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  ward_id TEXT REFERENCES wards(id) ON DELETE SET NULL,
  display_name TEXT CHECK(display_name IS NULL OR length(trim(display_name)) BETWEEN 1 AND 120),
  phone TEXT CHECK(phone IS NULL OR length(trim(phone)) BETWEEN 1 AND 32),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS complaints (
  id TEXT PRIMARY KEY CHECK(length(trim(id)) BETWEEN 1 AND 100),
  reference TEXT NOT NULL UNIQUE CHECK(
    length(reference) = 14 AND substr(reference, 1, 6) = 'RF-AG-' AND
    substr(reference, 7, 8) NOT GLOB '*[^0123456789ABCDEFGHJKMNPQRSTVWXYZ]*'
  ),
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
  description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 10 AND 1000),
  category TEXT NOT NULL CHECK(category IN (
    'pothole','waterlogging','open_manhole','streetlight','garbage',
    'erosion','water_pipe_leak','damaged_sign','other'
  )),
  status TEXT NOT NULL CHECK(status IN (
    'submitted','under_review','verified','in_progress','resolved','rejected'
  )),
  severity TEXT CHECK(severity IS NULL OR severity IN ('low','medium','high')),
  ward_id TEXT NOT NULL REFERENCES wards(id) ON DELETE RESTRICT,
  location_description TEXT CHECK(location_description IS NULL OR length(location_description) <= 150),
  latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),
  assigned_officer_id TEXT REFERENCES officers(id) ON DELETE SET NULL,
  assigned_at TEXT,
  rejection_reason TEXT CHECK(rejection_reason IS NULL OR length(rejection_reason) <= 1000),
  resolution_note TEXT CHECK(resolution_note IS NULL OR length(resolution_note) <= 1000),
  resolved_at TEXT,
  status_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(status <> 'resolved' OR (resolution_note IS NOT NULL AND resolved_at IS NOT NULL)),
  CHECK(status <> 'rejected' OR rejection_reason IS NOT NULL)
);

-- Sensitive reporter fields are separated from normal complaint projections.
CREATE TABLE IF NOT EXISTS complaint_private (
  complaint_id TEXT PRIMARY KEY REFERENCES complaints(id) ON DELETE CASCADE,
  reporter_name TEXT CHECK(reporter_name IS NULL OR length(trim(reporter_name)) BETWEEN 1 AND 120),
  reporter_contact TEXT CHECK(reporter_contact IS NULL OR length(trim(reporter_contact)) BETWEEN 1 AND 254),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(reporter_name IS NOT NULL OR reporter_contact IS NOT NULL)
);

-- Only report photos are supported in this phase; no repair-evidence kind exists.
CREATE TABLE IF NOT EXISTS complaint_images (
  id TEXT PRIMARY KEY CHECK(length(trim(id)) BETWEEN 1 AND 100),
  complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE RESTRICT,
  slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 3),
  storage_path TEXT NOT NULL UNIQUE CHECK(length(trim(storage_path)) BETWEEN 1 AND 500),
  content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
  size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),
  created_at TEXT NOT NULL,
  UNIQUE(complaint_id, slot)
);

CREATE TABLE IF NOT EXISTS complaint_status_history (
  id TEXT PRIMARY KEY CHECK(length(trim(id)) BETWEEN 1 AND 100),
  complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK(event_type IN ('created','status_change','assignment','reopened','note')),
  from_status TEXT CHECK(from_status IS NULL OR from_status IN (
    'submitted','under_review','verified','in_progress','resolved','rejected'
  )),
  to_status TEXT CHECK(to_status IS NULL OR to_status IN (
    'submitted','under_review','verified','in_progress','resolved','rejected'
  )),
  assignee_id TEXT REFERENCES officers(id) ON DELETE SET NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL CHECK(actor_role IN ('citizen','officer','admin','system')),
  note TEXT CHECK(note IS NULL OR length(note) <= 1000),
  created_at TEXT NOT NULL
);

-- Records administrative actions and officer/admin reads of private reporter contacts.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id INTEGER PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL CHECK(actor_role IN ('officer','admin','system')),
  action TEXT NOT NULL CHECK(length(trim(action)) BETWEEN 3 AND 100),
  target_complaint_id TEXT REFERENCES complaints(id) ON DELETE SET NULL,
  target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
