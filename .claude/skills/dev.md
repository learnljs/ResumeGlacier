---
name: dev
description: 本地 npm/npx/prisma 命令直接执行，无需 Docker 包装
---

# dev — 本地开发命令

本项目通过 Node.js + npm 直接运行，无需 Docker 包装。所有 npm/npx/prisma 命令直接在项目根目录执行即可。

## 命令映射

运行 npm/npx/prisma/next 时，**直接**调用即可：

```
npm ...          → npm ...
npx ...          → npx ...
prisma ...       → npx prisma ...
next ...         → npx next ...
```

## 常用命令

```bash
# 安装依赖
npm install

# 首次初始化数据库
npm run db:setup

# 启动开发服务器
npm run dev

# 生产构建
npm run build
npm run start

# 数据库
npm run db:generate   # 重新生成 Prisma 客户端
npm run db:push       # 推送 schema 到 SQLite
npm run db:studio     # 数据库管理界面

# 提交前自检
npm run lint
```

## 何时用 PM2

生产环境推荐用 PM2 守护：

```bash
npm install -g pm2
pm2 start npm --name "resume-glacier" -- run start
pm2 save
```
