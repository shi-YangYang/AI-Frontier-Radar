-- AlterTable
ALTER TABLE "users" ADD COLUMN "dingtalk_union_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_dingtalk_union_id_key" ON "users"("dingtalk_union_id");
