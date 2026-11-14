# 定时收取简历功能说明

## 概述

系统已实现自动定时收取简历功能，使用 `node-cron` 在应用内运行，无需配置外部定时任务。

## 定时规则

- **工作时间**：周一至周五 9:30-18:00（北京时间）
- **执行频率**：每 30 分钟
- **执行时间点**：9:30, 10:00, 10:30, 11:00, ..., 17:00, 17:30, 18:00

## 自动启动

定时任务在生产环境（`NODE_ENV=production`）下自动启动，无需手动干预。启动时机：

1. 应用启动时在 `instrumentation.ts` 中初始化
2. 队列（解析队列、筛选队列）初始化完成后启动

## 日志记录

所有定时获取任务的执行记录保存在 `data/logs/` 目录下：

```
data/logs/
├── scheduler-2026-06-03.log
├── scheduler-2026-06-04.log
└── ...
```

日志格式为 JSON，包含：

- `timestamp`：执行时间
- `level`：INFO 或 ERROR
- `message`：任务状态描述
- `taskId`：任务唯一标识
- `duration`：执行耗时
- `total`：获取结果汇总
- `perConfig`：每个邮箱配置的详细结果

示例日志：

```json
{
  "timestamp": "2026-06-03T10:00:05.123Z",
  "level": "INFO",
  "message": "定时获取邮件完成",
  "taskId": "fetch-1717401605123",
  "duration": "3456ms",
  "total": { "fetched": 5, "generated": 3, "errors": 0 },
  "perConfig": [
    { "alias": "HR邮箱", "fetched": 5, "generated": 3, "errors": 0 }
  ]
}
```

## API 端点

### 1. 查看调度器状态

```
GET /api/cron/status
```

返回：

```json
{
  "running": true,
  "timezone": "Asia/Shanghai",
  "schedule": {
    "weekday": "周一至周五",
    "timeRange": "9:30-18:00",
    "interval": "每 30 分钟"
  }
}
```

### 2. 管理调度器（启动/停止）

```
POST /api/cron/scheduler
Authorization: Bearer <CRON_SECRET>
Content-Type: application/json

{
  "action": "start"  // 或 "stop"
}
```

### 3. 手动触发获取

```
GET /api/cron/fetch-emails
Authorization: Bearer <CRON_SECRET>
```

此端点仍可用于手动触发，不受定时任务影响。

## 环境变量

| 变量          | 说明                             | 是否必须             |
| ------------- | -------------------------------- | -------------------- |
| `NODE_ENV`    | 设为 `production` 时启用定时任务 | 是                   |
| `CRON_SECRET` | API 端点认证密钥                 | 否（留空则跳过认证） |

## 开发环境

在开发环境（`yarn dev`）下，定时任务**不会自动启动**，避免干扰开发工作。如需测试，可：

1. 通过 API 手动启动：

   ```bash
   curl -X POST http://localhost:3000/api/cron/scheduler \
     -H "Authorization: Bearer YOUR_CRON_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"action": "start"}'
   ```

2. 手动触发单次获取：
   ```bash
   curl http://localhost:3000/api/cron/fetch-emails \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```

## 故障排查

1. **定时任务未执行**
   - 检查 `NODE_ENV` 是否为 `production`
   - 查看应用启动日志是否有 `[Scheduler]` 相关输出
   - 确认当前时间是否在工作时间内

2. **获取失败**
   - 查看 `data/logs/scheduler-YYYY-MM-DD.log` 中的 ERROR 记录
   - 检查邮箱配置是否正确
   - 确认网络连接和 IMAP 服务器状态

3. **日志文件未生成**
   - 检查 `data/logs/` 目录权限
   - 确认应用有写入权限

## 相关文件

- `lib/services/scheduler.ts` — 定时任务核心逻辑
- `instrumentation.ts` — 应用启动入口，初始化定时任务
- `app/api/cron/scheduler/route.ts` — 调度器管理 API
- `app/api/cron/status/route.ts` — 状态查询 API
- `app/api/cron/fetch-emails/route.ts` — 手动触发 API
