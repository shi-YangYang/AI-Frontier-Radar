#!/usr/bin/env bash
# 服务器端部署脚本：由 GitHub Actions 在 rsync 同步完成后通过 SSH 调用。
# 职责：按需安装依赖 → 生成 Prisma Client → 应用数据库迁移 → 重启服务 → 健康检查。
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$APP_DIR"

# 服务器本地可选覆盖（一次性创建，不随代码同步）
if [[ -f .deploy.env ]]; then
  # shellcheck disable=SC1091
  source .deploy.env
fi

FORCE_INSTALL="${FORCE_INSTALL:-false}"
RESTART_COMMAND="${RESTART_COMMAND:-sudo systemctl restart ai-frontier-radar}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:3000/health}"
HEALTHCHECK_RETRIES="${HEALTHCHECK_RETRIES:-30}"
REVISION="${REVISION:-unknown}"

mkdir -p .deploy
LOCK_HASH_FILE=".deploy/package-lock.sha256"
BRIDGE_LOCK_HASH_FILE=".deploy/bridge-package-lock.sha256"

log() { printf '[deploy] %s\n' "$*"; }
file_hash() { sha256sum "$1" | cut -d' ' -f1; }

needs_install() {
  local lock_file="$1" hash_file="$2"

  if [[ "$FORCE_INSTALL" == "true" ]]; then
    return 0
  fi

  if [[ ! -f "$hash_file" ]]; then
    return 0
  fi

  [[ "$(cat "$hash_file")" != "$(file_hash "$lock_file")" ]]
}

if needs_install package-lock.json "$LOCK_HASH_FILE"; then
  log '依赖有变化：执行 npm ci（跳过 Playwright 浏览器下载）'
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --no-audit --no-fund
  file_hash package-lock.json > "$LOCK_HASH_FILE"
else
  log '主依赖未变化：跳过 npm ci'
fi

if [[ -f wechat-bridge/package-lock.json ]]; then
  if needs_install wechat-bridge/package-lock.json "$BRIDGE_LOCK_HASH_FILE"; then
    log '微信桥依赖有变化：执行安装'
    npm --prefix wechat-bridge install --no-audit --no-fund
    file_hash wechat-bridge/package-lock.json > "$BRIDGE_LOCK_HASH_FILE"
  else
    log '微信桥依赖未变化：跳过安装'
  fi
fi

log '生成 Prisma Client'
npm run prisma:generate

log '应用数据库迁移'
npm run prisma:migrate:deploy

log "重启服务：${RESTART_COMMAND}"
eval "$RESTART_COMMAND"

log '健康检查'
for _ in $(seq 1 "$HEALTHCHECK_RETRIES"); do
  if curl -fsS "$HEALTHCHECK_URL" >/dev/null 2>&1; then
    printf 'revision=%s\ndeployed_at=%s\n' "$REVISION" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > .deploy/last-deploy.txt
    log "健康检查通过：${HEALTHCHECK_URL}（revision=${REVISION}）"
    exit 0
  fi

  sleep 2
done

log "健康检查失败：${HEALTHCHECK_URL}"
exit 1
