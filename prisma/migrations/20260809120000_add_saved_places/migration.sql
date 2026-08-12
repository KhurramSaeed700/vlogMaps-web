ALTER TABLE video_editor_states
  ADD COLUMN IF NOT EXISTS saved_places JSONB NOT NULL DEFAULT '[]'::jsonb;
