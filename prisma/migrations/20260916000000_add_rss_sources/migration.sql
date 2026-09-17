-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_watch_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source_type" TEXT NOT NULL DEFAULT 'x',
    "source_url" TEXT,
    "x_username" TEXT,
    "x_user_id" TEXT,
    "display_name" TEXT,
    "enabled" INTEGER NOT NULL DEFAULT 1 CHECK ("enabled" IN (0, 1)),
    "baseline_post_id" TEXT,
    "last_seen_post_id" TEXT,
    "last_polled_at" TEXT,
    "last_poll_status" TEXT,
    "last_poll_error" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);
INSERT INTO "new_watch_accounts" ("baseline_post_id", "created_at", "display_name", "enabled", "id", "last_poll_error", "last_poll_status", "last_polled_at", "last_seen_post_id", "updated_at", "x_user_id", "x_username") SELECT "baseline_post_id", "created_at", "display_name", "enabled", "id", "last_poll_error", "last_poll_status", "last_polled_at", "last_seen_post_id", "updated_at", "x_user_id", "x_username" FROM "watch_accounts";
DROP TABLE "watch_accounts";
ALTER TABLE "new_watch_accounts" RENAME TO "watch_accounts";
CREATE UNIQUE INDEX "watch_accounts_x_username_key" ON "watch_accounts"("x_username");
CREATE INDEX "watch_accounts_enabled_idx" ON "watch_accounts"("enabled");
CREATE UNIQUE INDEX "watch_accounts_source_type_source_url_key" ON "watch_accounts"("source_type", "source_url");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
