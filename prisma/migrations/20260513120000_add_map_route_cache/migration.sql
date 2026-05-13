CREATE TABLE IF NOT EXISTS "map_route_cache" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "cache_key" text NOT NULL UNIQUE,
  "profile" varchar(32) NOT NULL,
  "route_preference" varchar(32) NOT NULL,
  "request_params" jsonb NOT NULL,
  "payload" jsonb NOT NULL,
  "expires_at" timestamptz(6) NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_map_route_cache_expires_at"
  ON "map_route_cache" ("expires_at");
