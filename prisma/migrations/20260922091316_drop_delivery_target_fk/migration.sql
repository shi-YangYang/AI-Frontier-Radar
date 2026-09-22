/*
  Warnings:

  - Recreates the `delivery_events` table without the foreign key from `target_key` to
    `delivery_targets.target_key`, so a delivery target row can be physically deleted while
    delivery history (keyed by `target_key`) is preserved. Table data is copied unchanged.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
DROP TABLE IF EXISTS "new_delivery_events";
CREATE TABLE "new_delivery_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "x_post_id" TEXT NOT NULL,
    "target_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TEXT,
    "last_error" TEXT,
    "locked_at" TEXT,
    "sent_at" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "delivery_events_x_post_id_fkey" FOREIGN KEY ("x_post_id") REFERENCES "x_posts_raw" ("x_post_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_delivery_events" ("attempt_count", "created_at", "id", "last_error", "locked_at", "next_retry_at", "sent_at", "status", "target_key", "updated_at", "x_post_id") SELECT "attempt_count", "created_at", "id", "last_error", "locked_at", "next_retry_at", "sent_at", "status", "target_key", "updated_at", "x_post_id" FROM "delivery_events";
DROP TABLE "delivery_events";
ALTER TABLE "new_delivery_events" RENAME TO "delivery_events";
CREATE INDEX "delivery_events_status_next_retry_at_idx" ON "delivery_events"("status", "next_retry_at");
CREATE UNIQUE INDEX "delivery_events_x_post_id_target_key_key" ON "delivery_events"("x_post_id", "target_key");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
