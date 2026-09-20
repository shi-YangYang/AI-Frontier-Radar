# 部署（CD）

本文档说明如何把 AI 前沿雷达部署到自己的服务器。部署由 GitHub Actions 手动触发，**在 GitHub 构建、用 rsync 增量同步到服务器**，适合 2C2G 的小机器与海外（首尔等）网络环境。

## 总体设计

| 关注点 | 方案 |
| --- | --- |
| 触发方式 | GitHub → Actions → CD → Run workflow（手动，可指定分支/标签/提交） |
| 构建位置 | **GitHub runner**（服务器只有 2C2G，不做构建，避免 OOM 与长时间占用） |
| 传输方式 | **rsync 增量同步**（按文件内容校验，只传变化的文件，压缩传输） |
| 依赖安装 | 仅当 `package-lock.json` 变化时在服务器执行 `npm ci`；否则跳过 |
| 数据库 | 每次部署执行 `prisma migrate deploy`，只应用未执行的迁移 |
| 服务重启 | 通过可配置命令重启（默认 systemd），随后健康检查 `/health` |
| 数据安全 | `.env`、`.data/`、`wechat-bridge/.state/`、`node_modules/` 永不覆盖 |

增量同步的内容：`dist/`（后端构建）、`dist-web/`（前端构建）、`prisma/`（schema 与迁移）、`scripts/`（含部署脚本）、`package.json`/`package-lock.json`、`wechat-bridge/`（桥源码与依赖清单）。源码 `src/`、`web/`、测试与文档不会同步到服务器。

---

## 一、服务器一次性准备

以下命令以 Ubuntu 22.04/24.04、部署目录 `/opt/ai-frontier-radar`、部署用户 `deploy` 为例，按需替换。

### 1. 安装 Node.js 22 与基础工具

```bash
# Node.js 22（NodeSource）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs rsync curl

node -v    # 应 >= v22
npm -v
rsync --version | head -1
```

> 服务器位于首尔时，`deb.nodesource.com` 与 npm 官方源通常都很快；如遇缓慢可改用镜像源。

### 2. 创建部署用户与目录

```bash
sudo useradd -m -s /bin/bash deploy
sudo mkdir -p /opt/ai-frontier-radar
sudo chown -R deploy:deploy /opt/ai-frontier-radar
```

### 3. 创建生产环境变量文件

```bash
sudo -u deploy bash -c 'cat > /opt/ai-frontier-radar/.env <<"EOF"
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
SQLITE_PATH=.data/ai-news-monitor.sqlite
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请替换为强密码
LOG_LEVEL=info
EOF'
```

> `.env` 不会被部署流程覆盖，后续修改直接编辑该文件后重启服务即可。

### 4. 配置 systemd 服务

```bash
sudo tee /etc/systemd/system/ai-frontier-radar.service >/dev/null <<'EOF'
[Unit]
Description=AI Frontier Radar
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/ai-frontier-radar
ExecStart=/usr/bin/node dist/server/main.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ai-frontier-radar
```

### 5. 允许部署用户免密重启服务

```bash
echo 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart ai-frontier-radar, /usr/bin/systemctl status ai-frontier-radar' \
  | sudo tee /etc/sudoers.d/ai-frontier-radar-deploy
sudo chmod 440 /etc/sudoers.d/ai-frontier-radar-deploy
```

### 6. （可选）X 浏览器模式所需 Chromium

如果使用 X 数据源的浏览器模式（默认模式）：

```bash
sudo -u deploy bash -c 'cd /opt/ai-frontier-radar && npx playwright install chromium'
# 如缺系统库：
sudo npx playwright install-deps chromium
```

### 7. 生成部署密钥并授权

在你自己的电脑上执行（不要用已有主密钥）：

```bash
ssh-keygen -t ed25519 -C "github-actions-cd" -f ~/.ssh/ai-frontier-radar-deploy -N ""
# 把公钥装到服务器
ssh-copy-id -i ~/.ssh/ai-frontier-radar-deploy.pub deploy@<服务器IP>
# 验证
ssh -i ~/.ssh/ai-frontier-radar-deploy deploy@<服务器IP> 'echo ok'
```

---

## 二、配置 GitHub Secrets

仓库 → **Settings → Secrets and variables → Actions → New repository secret**，添加：

**必需（3 个）**：

| Secret | 说明 |
| --- | --- |
| `SSH_HOST` | 服务器 IP 或域名 |
| `SSH_USER` | 部署用户，例如 `ubuntu` |
| `SSH_PRIVATE_KEY` | 部署私钥**全文**（含 `-----BEGIN/END-----`） |

**可选（不填有默认值）**：

| Secret | 默认 | 说明 |
| --- | --- | --- |
| `DEPLOY_PATH` | `/opt/ai-frontier-radar` | 服务器部署目录 |
| `SSH_PORT` | `22` | SSH 端口 |
| `SSH_KNOWN_HOSTS` | 自动 `ssh-keyscan` | 固定服务器 host key（防中间人，推荐） |

> 私钥内容：`cat ~/.ssh/leida_deploy` 全选复制。

---

## 三、触发部署

1. 打开仓库 **Actions** 页 → 左侧选择 **CD**；
2. 点击 **Run workflow**，填写：
   - `ref`：要部署的引用，默认 `master`（也可填 `dev`、标签或提交 SHA）；
   - `run_checks`：是否在部署前跑类型检查与 smoke 测试（默认开）；
   - `force_install`：强制服务器重装依赖（默认关；只有依赖异常时才需要开）；
3. 点击运行，等待两个 job 完成：
   - **Build artifacts**：装依赖 → 类型检查 → 构建 → smoke → 打包 `release.tar.gz`；
   - **Deploy to server**：SSH 配置 → rsync 增量同步 → 远程执行 `scripts/deploy/remote-deploy.sh`（按需装依赖、生成 Prisma Client、应用迁移、重启服务、健康检查）。

部署成功后，Actions 的运行摘要会显示部署的提交与服务器路径；服务器上会记录 `.deploy/last-deploy.txt`。

---

## 四、服务器端可选覆盖（`.deploy.env`）

如需修改重启命令、健康检查地址等，在服务器部署目录创建 `.deploy.env`（不会被同步覆盖）：

```bash
# /opt/ai-frontier-radar/.deploy.env
RESTART_COMMAND="sudo systemctl restart ai-frontier-radar"
HEALTHCHECK_URL="http://127.0.0.1:3000/health"
HEALTHCHECK_RETRIES="30"
```

用 pm2 的服务器可改为：

```bash
RESTART_COMMAND="pm2 restart ai-frontier-radar --update-env"
```

---

## 五、首次部署后的收尾

1. 访问 `http://<服务器IP>:3000/`，用 `.env` 里的管理员账号登录；
2. 若使用微信推送：进入「配置 → 微信」扫码绑定，并给 ClawBot 发一条消息激活会话；
3. 建议前置 Nginx/Caddy 做 HTTPS 与域名（应用本身监听 3000）；
4. 服务器防火墙只需开放 80/443（或 3000）与你的 SSH 端口。

---

## 六、常见问题

**Q：rsync 报 `command not found`？**
服务器缺少 rsync：`sudo apt-get install -y rsync`。

**Q：部署后服务没起来？**
在服务器执行 `sudo systemctl status ai-frontier-radar -l` 查看日志；常见原因是 `.env` 缺失或 `npm ci` 失败。

**Q：依赖安装很慢？**
只有 `package-lock.json` 变化时才会安装；首尔到 npm 官方源通常较快，如仍慢可在服务器配置 `npm config set registry https://registry.npmmirror.com`。

**Q：想回滚？**
重新触发 CD，把 `ref` 填上一个可用提交的 SHA 即可（迁移不会自动回滚，涉及破坏性迁移时先备份 `.data/`）。

**Q：想更快的传输？**
首尔与 GitHub runner 之间延迟通常 150–250ms；当前方案只传变化文件并压缩，日常部署通常几秒到几十秒。若仍慢，可考虑自建 runner。

**Q：会不会覆盖我的数据？**
不会。`.env`、`.data/`（SQLite）、`wechat-bridge/.state/`（微信登录态）、`node_modules/` 均在排除列表中。
