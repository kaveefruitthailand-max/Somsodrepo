CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT '',
  room_id TEXT NOT NULL DEFAULT '',
  room_name TEXT NOT NULL DEFAULT '',
  message_kind TEXT NOT NULL DEFAULT 'text',
  sender TEXT NOT NULL DEFAULT '',
  sender_email TEXT NOT NULL DEFAULT '',
  applicant_id TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at_ms BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_messages_source_room_idx ON chat_messages (source, room_id, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx ON chat_messages (created_at_ms DESC);
CREATE INDEX IF NOT EXISTS chat_messages_applicant_id_idx ON chat_messages (applicant_id);
