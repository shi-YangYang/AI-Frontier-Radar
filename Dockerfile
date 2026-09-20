# syntax=docker/dockerfile:1

# ---------- 构建阶段 ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# 可选：npm 镜像源（默认官方源；国内构建可传 --build-arg NPM_REGISTRY=https://registry.npmmirror.com）
ARG NPM_REGISTRY=https://registry.npmjs.org/

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --registry="$NPM_REGISTRY"

COPY prisma ./prisma
COPY scripts ./scripts
COPY tsconfig.json ./
COPY src ./src
COPY web ./web

RUN npm run prisma:generate && npm run build

# ---------- 运行阶段 ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# 生产依赖 + Prisma CLI（容器启动时执行迁移）
ARG NPM_REGISTRY=https://registry.npmjs.org/

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund --registry="$NPM_REGISTRY" \
  && npm install --no-save prisma@6.19.3 --no-audit --no-fund --registry="$NPM_REGISTRY" \
  && npx playwright install --with-deps chromium --only-shell \
  && rm -rf /var/lib/apt/lists/* \
  && npm cache clean --force

COPY prisma ./prisma
COPY scripts ./scripts
RUN npm run prisma:generate

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-web ./dist-web

# 微信桥（独立依赖）
COPY wechat-bridge/package.json wechat-bridge/package-lock.json ./wechat-bridge/
COPY wechat-bridge/shims ./wechat-bridge/shims
RUN npm --prefix wechat-bridge install --no-audit --no-fund --registry="$NPM_REGISTRY" \
  && npm --prefix wechat-bridge cache clean --force
COPY wechat-bridge/src ./wechat-bridge/src

COPY scripts/deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
