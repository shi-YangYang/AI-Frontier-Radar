# 部署（CD）

本文档说明如何把 AI 前沿雷达部署到自己的服务器。部署由 GitHub Actions 手动触发：**在 GitHub 构建 Docker 镜像并推送到 GHCR，服务器拉取镜像运行**。适合 2C2G 小机器，环境一致性由镜像保证。

## 总体设计

| 关注点 | 方案 |
| --- | --- |
| 触发方式 | GitHub → Actions → CD → Run workflow（手动，可指定分支/标签/提交） |
| 构建位置 | GitHub runner（服务器 2C2G 不参与构建） |
| 产物 | 多阶段 Docker 镜像（含 Chromium 无头壳、微信桥、Prisma Client） |
| 镜像仓库 | GHCR：`ghcr.io/<owner>/<repo>:<短SHA>` 与 `:latest` |
| 服务器更新 | `docker compose pull` + `up -d`，只拉取变化的镜像层 |
| 数据库迁移 | 容器启动时自动执行 `prisma migrate deploy`（只应用未执行的迁移） |
| 数据持久化 | 卷挂载：`.data/`（SQLite/备份）、`wechat-bridge/.state/`（微信登录态）、`.x-browser-public-profile/`（X 浏览器资料） |

镜像分层做了缓存优化：改代码只重建 `dist`/`dist-web` 层，依赖不变时不重装 npm。

---

## 一、服务器一次性准备

以 Ubuntu、部署用户 `ubuntu`、部署目录 `/opt/ai-frontier-radar` 为例。

### 1. 安装 Docker 与 Compose 插件

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo apt-get install -y curl
sudo usermod -aG docker ubuntu
# 重新登录（exit 后 ssh leida 进来）使 docker 组生效
docker --version && docker compose version
```

> 服务器在首尔时 `get.docker.com` 与 GHCR 均可达；国内网络如慢可换 Docker 镜像源。

### 2. 创建部署目录与数据目录

```bash
mkdir -p /opt/ai-frontier-radar/{.data,wechat-bridge/.state,.x-browser-public-profile}
cd /opt/ai-frontier-radar
```

### 3. 创建生产环境变量文件

```bash
cat > /opt/ai-frontier-radar/.env <<'EOF'
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
SQLITE_PATH=.data/ai-news-monitor.sqlite
ADMIN_USERNAME=admin
ADMIN_PASSWORD=换成你的强密码
LOG_LEVEL=info
EOF
chmod 600 /opt/ai-frontier-radar/.env
```

> `.env` 由 `docker-compose.yml` 的 `env_file` 注入容器，不会被部署覆盖。
> 如需 X 代理等配置，继续往 `.env` 追加（参考 `.env.example`）。

### 4. （可选）提前登录 GHCR

若镜像仓库为私有，服务器需要能拉取。CI 部署时会用 `GHCR_PULL_TOKEN` 登录；你也可以先手动登录一次：

```bash
echo "<你的GitHub PAT，需 read:packages 权限>" | docker login ghcr.io -u <你的GitHub用户名> --password-stdin
```

### 5. 生成部署密钥并配置 `ssh leida`

在你自己的电脑上执行：

```bash
ssh-keygen -t ed25519 -C "leida" -f ~/.ssh/leida_deploy -N ""

cat >> ~/.ssh/config <<'EOF'

Host leida
  HostName <服务器IP>
  User ubuntu
  IdentityFile ~/.ssh/leida_deploy
  ServerAliveInterval 30
  ServerAliveCountMax 3
EOF
chmod 600 ~/.ssh/config ~/.ssh/leida_deploy

ssh-copy-id -i ~/.ssh/leida_deploy.pub ubuntu@<服务器IP>
ssh leida 'echo 连接成功'
```

---

## 二、配置 GitHub Secrets

仓库 → **Settings → Secrets and variables → Actions**：

**必需**：

| Secret | 说明 |
| --- | --- |
| `SSH_HOST` | 服务器 IP 或域名 |
| `SSH_USER` | 部署用户（如 `ubuntu`） |
| `SSH_PRIVATE_KEY` | 部署私钥**全文**（`cat ~/.ssh/leida_deploy`） |

**可选**：

| Secret | 默认 | 说明 |
| --- | --- | --- |
| `DEPLOY_PATH` | `/opt/ai-frontier-radar` | 服务器部署目录 |
| `SSH_PORT` | `22` | SSH 端口 |
| `SSH_KNOWN_HOSTS` | 自动 `ssh-keyscan` | 固定 host key（防中间人，推荐） |
| `GHCR_PULL_TOKEN` | 无 | 私有镜像拉取用的 GitHub PAT（`read:packages`）；镜像设为公开则不需要 |

> 仓库自带的 `GITHUB_TOKEN` 用于 CI 推送镜像（工作流已声明 `packages: write`），无需额外配置。
> 首次推送后，到 GitHub 仓库 → Packages 确认镜像可见性（默认私有）。

---

## 三、触发部署

1. 打开仓库 **Actions** → 左侧 **CD** → **Run workflow**；
2. 填写参数：
   - `ref`：要部署的分支/标签/提交，默认 `master`；
   - `run_checks`：构建前是否跑类型检查与 smoke（默认开）；
   - `image_tag`：自定义镜像标签（留空用提交短 SHA）；
3. 等待两个 job：
   - **Build & push image**：检查 → Docker 多阶段构建 → 推送 GHCR（带 GHA 层缓存）；
   - **Deploy to server**：同步 compose 文件 → 服务器 `docker compose pull` → `up -d` → 健康检查。

成功后运行摘要会显示镜像地址与提交；服务器上 `cat $DEPLOY_PATH/.deploy/last-deploy.txt` 可看当前部署版本。

---

## 四、日常运维

```bash
ssh leida

cd /opt/ai-frontier-radar
docker compose ps            # 容器状态
docker compose logs -f app   # 实时日志
docker compose restart app   # 重启
docker compose down          # 停止
```

**回滚**：重新触发 CD，`image_tag` 填一个历史镜像标签（如 `a1b2c3d4e5f6`），或手动：

```bash
IMAGE_REF=ghcr.io/shi-yangyang/ai-frontier-radar:<历史标签> docker compose up -d
```

**更新 `.env` 后**：`docker compose up -d` 使新环境变量生效。

---

## 五、Nginx 反向代理 + HTTPS（Let's Encrypt）

前置条件：域名已解析到服务器 IP，且云安全组放行 80/443。

```bash
# 1) 安装 Nginx 与 Certbot
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx

# 2) 站点配置（HTTP → 反代到应用）
sudo tee /etc/nginx/sites-available/leida520.site >/dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name leida520.site www.leida520.site;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/leida520.site /etc/nginx/sites-enabled/leida520.site
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# 3) 签发证书并自动配置 HTTPS + HTTP 跳转（邮箱换成你的）
sudo certbot --nginx -d leida520.site -d www.leida520.site \
  --non-interactive --agree-tos -m you@example.com --redirect
```

**自动续期**：certbot 安装时已注册 `certbot.timer`（每天检查、到期前自动续期并重载 Nginx）。验证：

```bash
systemctl list-timers certbot.timer
sudo certbot renew --dry-run     # 模拟续期，成功即配置无误
```

**安全建议**：应用端口 3000 只对本机开放（`deploy/docker-compose.yml` 已配置为 `127.0.0.1:3000:3000`），外网只经 Nginx 的 80/443。

## 六、首次部署后收尾

1. 浏览器打开 `https://<你的域名>/`，用 `.env` 的管理员账号登录；
2. 微信推送：进入「配置 → 微信」扫码绑定，并给 ClawBot 发一条消息激活会话；
3. 云安全组只需放行 80/443 与 SSH 端口。

---

## 七、常见问题

**Q：服务器拉不动镜像（超时/403）？**
私有镜像需配置 `GHCR_PULL_TOKEN`（PAT 勾选 `read:packages`）；或到 GitHub Packages 把镜像可见性改为 public。

**Q：容器起来又退出？**
`docker compose logs app` 看日志；常见原因是 `.env` 缺失、`SQLITE_PATH` 目录权限或端口被占用。

**Q：如何备份数据？**
`.data/` 目录就是全部数据（SQLite + 备份文件）。`tar -czf backup.tgz .data` 即可；微信登录态在 `wechat-bridge/.state/`。

**Q：X 浏览器模式需要额外装 Chromium 吗？**
不需要，镜像已内置 Chromium 无头壳（`--only-shell` 安装）。

**Q：镜像多大？**
约 1GB（含 Chromium 无头壳与系统依赖）；后续更新只拉变化的层，通常几十 MB。

**Q：想跑 x86 服务器但本地是 Mac？**
CI 在 `ubuntu-latest`（amd64）构建，与常见云服务器架构一致；如服务器是 arm64，请在 workflow 中加 `platforms: linux/arm64`。
