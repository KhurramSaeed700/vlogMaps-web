ALTER TABLE users
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk_user_id
  ON users(clerk_user_id)
  WHERE clerk_user_id IS NOT NULL;

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
  ADD COLUMN IF NOT EXISTS app_id TEXT,
  ADD COLUMN IF NOT EXISTS creator_name TEXT,
  ADD COLUMN IF NOT EXISTS creator_channel_url TEXT,
  ADD COLUMN IF NOT EXISTS locations JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_app_id
  ON videos(app_id)
  WHERE app_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_videos_owner_user_id
  ON videos(owner_user_id);

ALTER TABLE video_keyframes
  ADD COLUMN IF NOT EXISTS stop_end_time INTEGER,
  ADD COLUMN IF NOT EXISTS point_type VARCHAR(20) DEFAULT 'point',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS video_editor_states (
  video_id UUID PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL,
  points JSONB NOT NULL DEFAULT '[]'::jsonb,
  trip_route JSONB NOT NULL DEFAULT '{"start":null,"end":null}'::jsonb,
  route_shapes JSONB NOT NULL DEFAULT '{"trip":[],"timestampLegs":{}}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_editor_states_owner_user_id
  ON video_editor_states(owner_user_id);
