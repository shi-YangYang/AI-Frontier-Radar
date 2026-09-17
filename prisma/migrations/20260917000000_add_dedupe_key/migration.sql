-- Add optional stable dedupe key for cross-source duplicate detection.
ALTER TABLE "x_posts_raw" ADD COLUMN "dedupe_key" TEXT;

CREATE UNIQUE INDEX "x_posts_raw_dedupe_key_key" ON "x_posts_raw"("dedupe_key");
