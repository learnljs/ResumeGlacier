# PM2 与 Docker 部署对比及 Docker 部署完整指南

> 适用版本：项目由 PM2 裸机部署迁移至 Docker 容器化部署后的完整参考文档。

---

## 一、PM2 vs Docker 核心差异对比

| 维度 | PM2 部署 | Docker 部署 |
|------|---------|------------|
| **运行环境** | 裸机 Node.js，依赖服务器预装系统库（libcairo、libvips 等） | 容器内隔离运行，基础镜像 `node:24.18.0-trixie`（Debian Trixie）已包含所需系统库 |
| **进程管理** | PM2 `fork` 模式单实例（SQLite 不支持 cluster） | Docker Compose 管理，`restart: unless-stopped` 自动恢复 |
| **崩溃恢复** | `autorestart: true`，PM2 监控进程存亡 | Docker daemon 监控容器状态，按 `restart` 策略自动重启 |
| **部署流程** | `git pull → npm run build → pm2 restart` | `./prod.sh pack` 构建部署包 → scp 到服务器 → 解压 → `docker compose up -d` |
| **环境隔离** | 通过不同 PM2 配置 + 不同端口区分生产/测试环境 | 通过容器名称、端口映射、环境变量文件隔离 |
| **依赖管理** | 在服务器上 `npm install`，原生模块（canvas、sharp、tesseract）的编译依赖宿主机 | 构建时在容器内安装依赖，镜像固化，可重复构建 |
| **端口** | 3000（生产）/ 3002（测试） | 3000（生产）/ 3001（开发） |
| **启动入口** | `npm run start` → `next start`（Next.js 内置服务器） | **生产**：`node server.js`（standalone 模式自定义入口）；**开发**：`npm run dev` |
| **热重载** | 不支持 | 开发环境通过卷挂载 `.`:`/app` + `next dev` 支持 |
| **日志管理** | PM2 日志文件（`~/.pm2/logs/`） | `docker compose logs -f` 输出到 stdout/stderr |
| **数据持久化** | 直接读写宿主机文件系统 | 卷挂载 `.:/app` 映射到宿主机，数据与容器生命周期解耦 |
| **定时任务** | `node-cron` 内嵌在应用进程中（仅生产环境启用） | 同左，`instrumentation.ts` 中初始化，逻辑不变 |
| **多实例扩展** | 不支持（SQLite 限制） | 同样不支持（同一个 SQLite 原因） |
| **构建产物** | `.next/` 目录 | `.next/standalone/` + `.next/static/`（Next.js standalone 输出） |

### 核心设计理念差异

**PM2 模式**：应用直接运行在宿主机上，PM2 仅负责进程守护。环境的差异性（Node.js 版本、系统库版本）可能导致"在我机器上能跑"的问题。

**Docker 模式**：应用运行在容器内，环境由镜像确保一致性。采用"构建一次，到处运行"的策略——在开发机上通过 `./prod.sh pack` 构建好部署包（tar.gz），部署到服务器只需解压 + 启动容器。

---

## 二、项目 Docker 架构说明

### 2.1 架构总览

```
项目根目录
├── Dockerfile                  # 极简镜像定义：node:24 + npm 镜像源 + WORKDIR /app
├── docker-compose.yml           # 开发环境 compose 配置（端口 3001，tty 交互模式，next dev）
├── docker-compose.prod.yml      # 生产 compose 配置（端口 3000，restart 策略，node server.js）
├── dev.sh                       # 开发环境管理脚本（init / live / start / stop / log / exec）
├── prod.sh                      # 生产环境管理脚本（pack / start / stop / log / exec）
├── .env                         # 开发环境变量（当前活跃）
├── .env.example                 # 环境变量模板（供生产部署参考）
├── .packignore                  # 打包排除规则
├── .pack-fix-deps.mjs           # 打包后原生依赖补全脚本
└── next.config.mjs              # output: 'standalone' + serverExternalPackages
```

### 2.2 Dockerfile 设计哲学

```dockerfile
FROM node:24.18.0-trixie
RUN npm config set registry https://registry.npmmirror.com/
WORKDIR /app
```

**极简设计，不包含 COPY 指令。** 源代码通过以下方式注入容器：
- **开发环境**：卷挂载 `.:/app`（实时同步，支持热重载）
- **生产环境**：部署包解压后的目录通过卷挂载注入

这种设计的优势：
- 镜像无需每次代码变更时重新构建
- 开发和生产共用同一个镜像
- 部署包里直接包含已构建的 standalone 产物，启动即用

### 2.3 双 Compose 文件设计

| 对比维度 | `docker-compose.yml`（开发） | `docker-compose.prod.yml`（生产） |
|---------|---------------------------|----------------------------------|
| **容器名** | `${CONTAINER_NAME:-hr_dev}` | `${CONTAINER_NAME:-hr_prod}` |
| **端口** | `${PORT:-3001}` | `${PORT:-3000}` |
| **环境文件** | `.env` | `.env` |
| **NODE_ENV** | `development` | `production` |
| **额外环境** | `tty: true` + `stdin_open: true` | `HOSTNAME=0.0.0.0` |
| **启动命令** | `npm run dev` | `node server.js` |
| **重启策略** | 无（开发用） | `${RESTART_POLICY:-unless-stopped}` |

**关键注意**：`docker-compose.prod.yml` 不会直接在源码目录使用。在 `./prod.sh pack` 过程中，它会被复制到 standalone 部署包内部并重命名为 `docker-compose.yml`。服务器上解压部署包后，直接用 `docker compose up -d` 即可启动。

### 2.4 打包流程（`prod.sh pack`）

```
1. docker compose build                   → 构建镜像
2. 容器内 npx prisma generate            → 生成 Prisma 客户端
3. 容器内 NODE_ENV=production npm run build → 生成 .next/standalone/
4. 根据 .packignore 清理 standalone 中多余文件
5. 复制 .next/static、public/ 到 standalone/
6. 复制 docker-compose.prod.yml → standalone/docker-compose.yml
7. 复制 .env.example → standalone/.env.example
8. .pack-fix-deps.mjs 补全 serverExternalPackages 原生依赖
9. 打包 standalone/ → build/hr-prod-YYYYMMDD-HHmmss.tar.gz
```

**`.pack-fix-deps.mjs` 的作用**：Next.js standalone 构建的静态分析有时会遗漏通过 `require()` 或动态方式引用的原生模块（如 `imapflow`、`sharp`、`canvas`、`tesseract.js` 等）。该脚本从完整 `node_modules` 中将这些模块及其传递依赖补全到 standalone 的 `node_modules`。

---

## 三、开发环境 Docker 部署指南

### 3.1 前置要求

- Docker ≥ 20.10（推荐 Docker Desktop 或 Docker Engine + Docker Compose v2）
- 项目源码已 clone 到本地
- AI API Key（如需测试 AI 功能）

### 3.2 首次初始化

```bash
# 1. 配置环境变量（首次）
cp .env.example .env
# 编辑 .env 填入：
#   - ENCRYPTION_KEY（必填，64 位十六进制，生成：openssl rand -hex 32）
#   - OPENAI_API_KEY（可选，也可在管理后台配置）
#   - PORT=3001（开发默认端口）

# 2. 初始化（安装依赖 + 生成 Prisma 客户端 + 初始化数据库）
./dev.sh init
```

`./dev.sh init` 实际执行：
```bash
npm install
npx prisma generate
npx prisma db push
rm -rf .next   # 清理旧构建缓存
```

### 3.3 日常开发

| 命令 | 用途 | 说明 |
|------|------|------|
| `./dev.sh live` | **前台启动**（推荐） | Ctrl+C 退出自动清理容器，日志实时输出 |
| `./dev.sh start` | 后台启动 | 后台运行，需手动 `./dev.sh stop` 停止 |
| `./dev.sh log` | 查看日志 | `docker compose logs -f` 实时跟踪 |
| `./dev.sh status` | 查看状态 | 显示容器运行状态和端口号 |
| `./dev.sh stop` | 停止并清理 | 执行 `docker compose down --remove-orphans` |
| `./dev.sh build` | 重新构建镜像 | 基础镜像更新或 Dockerfile 变更后使用 |

### 3.4 在容器中执行命令

```bash
# 任意 npm/npx 命令（在一次性容器中执行）
./dev.sh npm install <package-name>
./dev.sh npx prisma generate
./dev.sh npx prisma db push
./dev.sh npx prisma studio        # 启动数据库管理界面
./dev.sh npx tsx scripts/<脚本名>

# 校验
./dev.sh npm run lint

# 在运行中的容器内执行
./dev.sh exec bash                # 进入交互式 shell
./dev.sh exec npx prisma studio   # 在运行中的容器执行命令
```

### 3.5 热重载机制

开发环境的 `docker-compose.yml` 中配置了 `volumes: - .:/app`，将项目根目录完整绑定挂载到容器的 `/app`。Next.js 开发模式（`next dev`）会监听文件变更并自动编译，修改代码后无需重启容器即可看到效果。

**注意事项**：
- 新增 npm 依赖后，需要重建容器：`./dev.sh stop && ./dev.sh init && ./dev.sh start`
- Prisma schema 变更后需手动执行：`./dev.sh npx prisma generate && ./dev.sh npx prisma db push`
- `.next` 缓存目录可能导致异常，可用 `./dev.sh init` 清理重建

### 3.6 开发环境变量

```bash
# .env 关键配置
DATABASE_URL="file:./data/resume.db"      # SQLite 路径（相对 /app）
ENCRYPTION_KEY="<64位十六进制>"            # 必填，AES-256-GCM 密钥
PORT=3001                                   # 开发端口
PARSING_CONCURRENCY=5                       # 解析并发（开发可适当调高）
SCREENING_CONCURRENCY=10                    # 筛选并发（开发可适当调高）
```

---

## 四、生产环境 Docker 部署指南

### 4.1 服务器前置要求

- Docker ≥ 20.10 + Docker Compose v2
- 硬盘空间 ≥ 10GB（数据库 + 上传文件 + 照片）
- 网络可访问 AI API（OpenAI / 兼容接口）

### 4.2 构建部署包（在开发机/构建机上）

```bash
# 在项目根目录执行
./prod.sh pack
```

产物位置：`build/hr-prod-YYYYMMDD-HHmmss.tar.gz`（如 `build/hr-prod-20260722-143000.tar.gz`）

### 4.3 首次部署（在服务器上）

```bash
# 1. 创建部署目录
mkdir -p /var/www/hr-system
cd /var/www/hr-system

# 2. 上传部署包（在本地执行）
scp build/hr-prod-*.tar.gz user@your-server:/var/www/hr-system/

# 3. 解压
tar xzf hr-prod-*.tar.gz

# 4. 配置环境变量
cp .env.example .env
vim .env   # 填入真实配置（详见 4.4 节）

# 5. 创建必要目录
mkdir -p data/uploads
mkdir -p data/logs
mkdir -p public/photos

# 6. 启动
docker compose up -d
```

### 4.4 生产环境变量必填项

```bash
# .env 生产配置
DATABASE_URL="file:./data/resume.db"            # SQLite 数据库路径
ENCRYPTION_KEY="<64位十六进制>"                  # 必填！生成：openssl rand -hex 32
CRON_SECRET="<随机字符串>"                        # 必填！定时任务 API 的 Bearer token
SCREENING_CONCURRENCY=2                          # 生产建议 1-2，不可过高
PARSING_CONCURRENCY=1                            # 必须为 1（SQLite 不支持并发写）
PORT=3000                                        # 生产端口

# AI 配置（可选，推荐在管理后台配置，支持多配置切换）
# OPENAI_API_KEY="sk-xxx"
# OPENAI_BASE_URL="https://api.openai.com/v1"
# OPENAI_MODEL="gpt-4o"
```

### 4.5 容器管理

```bash
# 启动
docker compose up -d

# 停止
docker compose down

# 重启
docker compose restart

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f          # 实时跟踪
docker compose logs --tail=100  # 最近 100 行

# 进入容器
docker compose exec hr bash
```

**注意**：服务器上的 `prod.sh` 脚本在部署包解压后的 `standalone/` 目录中，也可以使用 `./prod.sh start|stop|status|log` 等命令管理容器。

### 4.6 更新部署

```bash
# 1. 备份数据库（重要！）
cp data/resume.db data/resume-backup-$(date +%Y%m%d).db

# 2. 停止当前容器
docker compose down

# 3. 备份并替换部署文件（保留 .env、data/ 和 public/photos/）
# 方式 A：解压新包覆盖（确保不覆盖 .env 和 data/ 目录）
tar xzf hr-prod-NEW.tar.gz --skip-old-files

# 方式 B：切换到新目录，软链接 data 和 .env
cd /var/www/hr-system
ln -sf ../hr-data/data ./data
ln -sf ../hr-data/.env ./.env

# 4. 启动新版本
docker compose up -d

# 5. 确认正常运行后清理旧备份
```

### 4.7 生产环境目录结构

```
/var/www/hr-system/
├── docker-compose.yml        # 来自 docker-compose.prod.yml
├── Dockerfile                # 已在打包时复制
├── .env                      # 手动创建（从 .env.example 复制并编辑）
├── server.js                 # Next.js standalone 入口
├── package.json              # 精简的依赖清单
├── node_modules/             # 已补全原生依赖
├── .next/
│   └── static/               # 静态资源
├── public/
│   ├── photos/               # 候选人照片（需手动创建，持久化）
│   ├── pdf.worker.min.mjs    # PDF worker
│   └── standard-fonts/       # PDF 渲染字体
├── data/
│   ├── resume.db             # SQLite 数据库（需手动创建目录）
│   ├── uploads/              # 简历附件上传目录
│   └── logs/                 # 调度器日志
├── chi_sim.traineddata       # Tesseract 中文 OCR 数据
└── eng.traineddata           # Tesseract 英文 OCR 数据
```

---

## 五、注意事项与最佳实践

### 5.1 SQLite 并发限制（关键！）

```
⚠️ PARSING_CONCURRENCY 必须设为 1，不可调高！
```

SQLite 不支持并发写入。`docker-compose.prod.yml` 中虽然只有一个容器实例（`instances: 1`），但应用内部的 `resume-parsing-queue.ts` 如果并发数 > 1，会导致数据库锁定错误。

**Docker 与 PM2 的差异**：PM2 通过 `exec_mode: 'fork'` 强制单进程；Docker 没有进程级别的约束，完全依赖应用内部的并发控制。务必检查 `.env` 或后台配置中 `PARSING_CONCURRENCY=1`。

### 5.2 数据备份策略

```bash
# 定期备份数据库（建议每日）
cp data/resume.db /backup/resume-$(date +%Y%m%d).db

# 备份上传文件（邮件附件简历）
tar czf /backup/uploads-$(date +%Y%m%d).tar.gz data/uploads/

# 备份候选人照片
tar czf /backup/photos-$(date +%Y%m%d).tar.gz public/photos/
```

建议通过 crontab 设置自动化备份：
```bash
0 3 * * * cp /var/www/hr-system/data/resume.db /backup/resume-$(date +\%Y\%m\%d).db
```

### 5.3 反向代理（HTTPS）

项目未内置 nginx/Caddy。Next.js 直接提供 HTTP 服务，生产环境建议在前端加一层反向代理处理 HTTPS：

```nginx
# nginx 示例配置
server {
    listen 443 ssl;
    server_name hr.example.com;

    ssl_certificate /etc/nginx/ssl/hr.crt;
    ssl_certificate_key /etc/nginx/ssl/hr.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 5.4 端口规划

| 环境 | Docker 端口 | 说明 |
|------|-----------|------|
| 开发 | 3001 | `docker-compose.yml` 默认 |
| 生产 | 3000 | `docker-compose.prod.yml` 默认 |
| PM2 测试（旧） | 3002 | 已废弃，Docker 不再使用 |

如果同一台服务器上需要同时跑多个环境（不推荐，SQLite 无法共库），可通过修改 `.env` 中的 `PORT` 变量切换。

### 5.5 原生模块依赖

以下包包含原生 C/C++ 扩展，需要在容器内编译：

| 包名 | 用途 | 系统依赖（容器已预装） |
|------|------|----------------------|
| `canvas` | PDF/图片渲染 | libcairo2, libpango, libjpeg, libgif |
| `sharp` | 图片处理 | libvips |
| `tesseract.js` | OCR 识别 | tesserocr（通过 npm 包内嵌） |
| `imapflow` | IMAP 邮件收取 | 无特殊依赖 |

基础镜像 `node:24.18.0-trixie`（Debian Trixie）已预装这些系统库，`./prod.sh pack` 中的 `.pack-fix-deps.mjs` 会确保这些包正确包含在部署包中。

### 5.6 数据库路径解析

`DATABASE_URL="file:./data/resume.db"` 是相对于 Prisma Client 运行时工作目录（`/app`）解析的。在 Docker 容器内，工作目录固定为 `/app`，所以 `./data/resume.db` 解析为 `/app/data/resume.db`，通过卷挂载映射到宿主机。

**注意**：不要在 `.env` 中使用绝对路径（如 `file:/var/www/hr/data/resume.db`），因为容器内路径结构是 `/app/...`。

### 5.7 定时任务

定时任务（邮件自动收取）使用 `node-cron` 内置在应用进程中，在 `instrumentation.ts` 启动时初始化：

```typescript
// 仅 NODE_ENV=production 时启用
if (process.env.NODE_ENV === 'production') {
  const { startScheduler } = await import('@/lib/services/scheduler')
  startScheduler()
}
```

- 频率：周一至周五 9:30-18:00（Asia/Shanghai），每 30 分钟
- 日志：`data/logs/scheduler-YYYY-MM-DD.log`
- 外部触发：`POST /api/cron/scheduler`（需 Bearer `CRON_SECRET`）

### 5.8 镜像更新

当你修改了 `Dockerfile` 或需要更新基础镜像时：

```bash
# 拉取最新 node:24.18.0-trixie
docker pull node:24.18.0-trixie

# 重新构建镜像
./dev.sh build     # 开发环境
./prod.sh build    # 生产环境
```

npm 依赖变更后也需要重新打包（因为 `.pack-fix-deps.mjs` 依赖本地的 `node_modules` 结构）：

```bash
./dev.sh npm install <package>
./prod.sh pack      # 包含新依赖的部署包
```

### 5.9 健康检查

当前 compose 文件未配置 `healthcheck`。建议在生产环境添加：

```yaml
# docker-compose.prod.yml 补充
services:
  hr:
    # ... 现有配置 ...
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/api/dashboard/stats', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
```

### 5.10 日志管理

Docker 日志默认输出到 stdout/stderr，由 Docker daemon 管理：

```bash
# 查看日志
docker compose logs -f --tail=200

# 日志持久化（通过 docker compose 的 logging 驱动配置）
# 或使用 Docker 的 json-file 驱动（默认），日志文件在 /var/lib/docker/containers/
```

注意：定时任务日志（`data/logs/scheduler-YYYY-MM-DD.log`）写入文件系统，不在 Docker stdout 中。

---

## 六、从 PM2 迁移到 Docker 的步骤清单

### 6.1 迁移前准备

- [ ] 确认服务器已安装 Docker 和 Docker Compose v2
- [ ] 确认服务器磁盘空间充足（数据库 + uploads + photos + 镜像）
- [ ] 备份当前数据库：`cp prisma/data/resume.db prisma/data/resume-pre-docker.db`
- [ ] 备份上传文件：`tar czf uploads-backup.tar.gz data/uploads/`
- [ ] 备份照片：`tar czf photos-backup.tar.gz public/photos/`

### 6.2 数据迁移

Docker 部署包的数据目录结构沿用原有设计，数据文件可直接复用：

```bash
# 在服务器上，将 PM2 环境的数据复制到 Docker 部署目录
cp /var/www/resume-system/hr/prisma/data/resume.db /var/www/hr-system/data/
cp -r /var/www/resume-system/hr/data/uploads/* /var/www/hr-system/data/uploads/
cp -r /var/www/resume-system/hr/public/photos/* /var/www/hr-system/public/photos/
```

### 6.3 环境变量迁移

| PM2 配置（`ecosystem.config.js`） | Docker 配置（`.env`） | 说明 |
|-----------------------------------|----------------------|------|
| `NODE_ENV: 'production'` | 自动设置（compose 中 `NODE_ENV=production`） | 无需手动配置 |
| `PORT: 3000` | `PORT=3000` | 端口号，保持一致 |
| 无（Prisma 默认路径） | `DATABASE_URL=file:./data/resume.db` | 数据库路径 |
| 无（之前可能未加密） | `ENCRYPTION_KEY=<64位十六进制>` | **必填**，新生成或复用旧的 |
| 无（cron 无认证） | `CRON_SECRET=<随机字符串>` | **必填**，定时任务安全密钥 |
| 无（环境变量中） | `OPENAI_API_KEY=...` 或在后台配置 | AI Key |
| `PARSING_CONCURRENCY` | `PARSING_CONCURRENCY=1` | 必须为 1 |

### 6.4 停止旧服务

```bash
# 停止 PM2 进程
pm2 stop hr-resume-system
pm2 stop hr-test

# 确认端口释放
ss -tlnp | grep -E '3000|3002'

# 可选：取消 PM2 开机自启
pm2 unstartup
```

### 6.5 启动 Docker 服务

```bash
cd /var/www/hr-system
docker compose up -d

# 验证
docker compose ps
docker compose logs --tail=50
curl http://localhost:3000/api/dashboard/stats
```

### 6.6 验证清单

- [ ] Docker 容器正常运行（`docker compose ps` 显示 `Up`）
- [ ] 应用端口可访问（`curl http://localhost:3000`）
- [ ] 管理后台页面正常打开
- [ ] 数据库数据完整（对比记录数）
- [ ] 邮件收取功能正常（可手动触发测试）
- [ ] AI 筛选功能正常（创建任务批次测试）
- [ ] 定时任务正常启动（检查 `data/logs/scheduler-*.log`）
- [ ] 上传文件可访问（简历附件预览）
- [ ] 照片可访问（候选人照片显示）

### 6.7 回滚方案（如 Docker 部署异常）

```bash
# 停止 Docker
docker compose down

# 重新启动 PM2
cd /var/www/resume-system/hr
pm2 start ecosystem.config.js
pm2 start ecosystem.test.config.js   # 如有测试环境

# 恢复数据（如 Docker 期间有写入）
cp /var/www/hr-system/data/resume.db /var/www/resume-system/hr/prisma/data/
```

---

## 七、常用命令速查

### 开发环境

| 命令 | 用途 |
|------|------|
| `./dev.sh init` | 首次初始化（安装依赖 + 数据库） |
| `./dev.sh live` | 前台启动（推荐，Ctrl+C 清理退出） |
| `./dev.sh start` | 后台启动 |
| `./dev.sh stop` | 停止并清理容器 |
| `./dev.sh status` | 查看运行状态 |
| `./dev.sh log` | 查看实时日志 |
| `./dev.sh build` | 重新构建镜像 |
| `./dev.sh exec bash` | 进入容器 shell |
| `./dev.sh npm install <pkg>` | 安装新依赖 |
| `./dev.sh npx prisma studio` | 数据库管理 |
| `./dev.sh npm run lint` | 代码检查 |

### 生产环境

| 命令 | 用途 |
|------|------|
| `./prod.sh pack` | 构建部署包 |
| `./prod.sh start` | 后台启动 |
| `./prod.sh stop` | 停止 |
| `./prod.sh status` | 查看状态 |
| `./prod.sh log` | 查看日志 |
| `./prod.sh exec bash` | 进入容器 shell |
| `docker compose up -d` | 直接启动（部署包解压后） |
| `docker compose down` | 停止并清理 |
| `docker compose restart` | 重启 |
| `docker compose logs -f` | 查看实时日志 |
| `docker compose exec hr bash` | 进入容器 |

---

## 八、故障排查

### 容器无法启动

```bash
# 查看详细错误
docker compose logs

# 常见原因：
# 1. .env 中 ENCRYPTION_KEY 未配置或格式不正确 → 检查是否为 64 位十六进制
# 2. 端口被占用 → ss -tlnp | grep <PORT>
# 3. 数据库文件权限问题 → chmod 644 data/resume.db
```

### 数据库锁定错误

```bash
# 症状：SQLITE_BUSY 错误
# 原因：PARSING_CONCURRENCY > 1 或定时任务和手动操作并发写入

# 解决：
# 1. 确认 .env 中 PARSING_CONCURRENCY=1
# 2. 重启容器：docker compose restart
```

### 原生模块加载失败

```bash
# 症状：Error: Cannot find module 'canvas' / 'sharp' 等
# 原因：.pack-fix-deps.mjs 未正确补全依赖

# 解决：
# 1. 确认打包过程无报错
# 2. 检查部署包的 node_modules 中是否包含对应模块
# 3. 手动在容器内安装：docker compose exec hr npm install canvas sharp
```

### 定时任务未启动

```bash
# 检查：NODE_ENV 是否为 production
docker compose exec hr printenv NODE_ENV

# 定时任务日志：
# 查看 data/logs/scheduler-YYYY-MM-DD.log 是否存在并被写入
```
