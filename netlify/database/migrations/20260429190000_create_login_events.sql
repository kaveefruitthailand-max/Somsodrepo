CREATE TABLE IF NOT EXISTS login_events (
  id TEXT PRIMARY KEY,
  logged_at TIMESTAMP NOT NULL,
  method TEXT NOT NULL DEFAULT '',
  applicant_id TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  real_name TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT '',
  location_status TEXT NOT NULL DEFAULT '',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  altitude DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  error TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS login_events_logged_at_idx ON login_events (logged_at DESC);
CREATE INDEX IF NOT EXISTS login_events_applicant_id_idx ON login_events (applicant_id);
