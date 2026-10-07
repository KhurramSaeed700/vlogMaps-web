ALTER TABLE "videos" ADD COLUMN "visibility" VARCHAR(20) NOT NULL DEFAULT 'public';
ALTER TABLE "videos" ADD CONSTRAINT "videos_visibility_check"
  CHECK ("visibility" IN ('private', 'unlisted', 'public'));
CREATE INDEX "idx_videos_status_visibility" ON "videos"("status", "visibility");
