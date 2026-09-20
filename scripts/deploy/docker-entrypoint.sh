#!/usr/bin/env bash
# 容器入口：应用数据库迁移后启动服务。
set -euo pipefail

cd /app

echo "[entrypoint] 应用数据库迁移…"
node scripts/prisma-cli.cjs migrate deploy

echo "[entrypoint] 启动服务…"
exec node dist/server/main.js
