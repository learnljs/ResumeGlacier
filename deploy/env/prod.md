# 正式环境

## 分支管理
- 项目分支应为 `release`，且需要与远程的 `release` 分支保持一致。

## 构建
- 项目启动前，需要先运行 `npm install` 安装依赖，再运行 `npm run db:setup` 同步数据库 schema，最后运行 `npm run build` 确保构建成功。

## 启动方式

### 直接启动（前台）

```bash
npm run start
```

### PM2 守护（推荐）

```bash
npm install -g pm2
pm2 start npm --name "resume-glacier" -- run start
pm2 save
pm2 startup   # 开机自启
```

SQLite 不支持多进程并发写，PM2 必须使用 `fork` 模式单实例（默认）。
