-- CreateTable
CREATE TABLE IF NOT EXISTS "source_packs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "source_pack_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pack_id" TEXT NOT NULL,
    "watch_account_id" TEXT NOT NULL,
    CONSTRAINT "source_pack_items_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "source_packs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "source_pack_items_watch_account_id_fkey" FOREIGN KEY ("watch_account_id") REFERENCES "watch_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "source_packs_name_key" ON "source_packs"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "source_pack_items_pack_id_watch_account_id_key" ON "source_pack_items"("pack_id", "watch_account_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "source_pack_items_watch_account_id_idx" ON "source_pack_items"("watch_account_id");
