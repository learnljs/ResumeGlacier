# CLAUDE.md

本文件为 Claude Code 提供项目指引。

## 项目概述

**ResumeGlacier** — Self-hosted AI resume screening for small HR teams。
基于 Next.js 16 + TypeScript + SQLite + Prisma 的全栈 Web 应用，通过 IMAP 收取邮件简历，AI 按冰山模型 6 维度筛选候选人。界面全中文。包管理器：**npm**。无认证层（假设内网部署）。纯函数有 Vitest 单测（`npm test`），端到端验证通过 Playwright MCP 或 `npm run test:e2e` 进行。

## 开发环境

本项目通过 Node.js + npm 直接运行，无需 Docker。

**前置要求**：Node.js 20+ 与 npm。

```bash
npm install          # 安装依赖
npm run db:setup     # 首次：prisma generate + db push
npm run dev          # 启动开发服务器（http://localhost:3000）
```

构建与生产：

```bash
npm run build        # 生产构建
npm run start        # 生产启动（端口 3000）
```

## 编码准则

1. **先想再做**：明确陈述假设；不确定时提问而非猜测；暴露权衡并列出方案利弊；有更简单方案时说明为何不选。
2. **简洁优先**：只写解决问题的最少代码；不写投机性功能；不为一次性使用做抽象。
3. **外科手术式修改**：只改必须改的；不顺手"优化"无关代码、注释或格式；不重构没坏的东西；匹配现有风格。
4. **目标驱动，人类确认**：定义成功标准；每个任务完成或涉及后端/数据库变更后报告结果，等待确认再继续；能用更少步骤就用更少步骤。
5. **确定性逻辑禁止交给模型**：重试策略、路由逻辑、阈值判断等必须写成显式代码（条件语句、配置值、查找表）。模型只负责分类、摘要、草稿、歧义消解。如 `hard-condition-filter.ts` 的硬条件筛选、`tag-detector.ts` 的规则打标均为此原则的实践。
6. **暴露冲突，不折中**：代码库存在矛盾模式时，明确指出冲突并询问该遵循哪个；不混合两种模式，不自行选择。

## 项目约定

- **语言**：UI 文本、commit message、代码注释使用中文。技术术语保留英文（API、SDK、Webhook、IMAP、OCR 等）。
- **命名**：`lib/services/` 下文件用 kebab-case（如 `ai-screener.ts`），组件用 PascalCase。API 路由遵循 RESTful 风格。
- **路径别名**：`@/*` 映射项目根目录，导入始终使用此别名。
- **样式**：使用 `lib/utils.ts` 的 `cn()`（clsx + tailwind-merge）合并 className，UI 基础组件遵循 shadcn/ui 模式。
- **提交**：遵循 Conventional Commits（`feat:`、`fix:`、`refactor:`、`docs:`、`style:`、`perf:`）。
- **Prisma**：无迁移，直接用 `prisma db push`。schema 变更后 `prisma generate`。

## 常用命令

所有命令在项目根目录直接执行：

```bash
# 构建 & 生产
npm run build              # 生产构建
npm run start              # 生产启动（端口 3000）

# 数据库
npm run db:generate        # 重新生成 Prisma 客户端
npm run db:push            # 推送 schema 到 SQLite
npm run db:studio          # 数据库管理界面
npm run db:setup           # 首次初始化（generate + push）

# 代码质量
npm run lint               # 代码检查（应用 + scripts 两轮 tsc）
npm run typecheck          # 同上
npm run typecheck:app      # 仅应用（tsconfig.json）
npm run typecheck:scripts  # 仅 scripts/（tsconfig.scripts.json）

# 脚本
npx tsx scripts/full-mailbox-sync.ts                  # 列出邮箱配置
npx tsx scripts/full-mailbox-sync.ts <id>             # 全量同步（清空前需输入 yes 确认；CI 里加 --yes）
```

## 验证方式

改动验证先跑 `npm test`（Vitest 纯函数单测，测试放在 `tests/unit/`），再通过 Playwright MCP 或 `npm run test:e2e` 做端到端测试；Playwright MCP 的截图统一放在 `.playwright-mcp/` 目录下。

## 关键环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | SQLite 路径，**相对 `prisma/schema.prisma` 解析**（如 `file:./data/resume.db` → `prisma/data/resume.db`） |
| `ENCRYPTION_KEY` | **64 位十六进制**字符，AES-256-GCM 密钥（必填，生成：`openssl rand -hex 32`）。**一旦丢失无法解密历史数据** |
| `PARSING_CONCURRENCY` | 默认 `1`，SQLite 不支持并发写，不要调高 |
| `SCREENING_CONCURRENCY` | 默认 `2`，AI 筛选并发数 |
| `CRON_SECRET` | 定时任务 API 的 Bearer token |
| `NEXT_PUBLIC_BASE_PATH` | 子路径部署时设置（如 `/glacier`） |

其他常规变量（`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`、`PORT`）语义清晰，见 `.env.example` 文件。

## 架构要点

### 服务器入口与 Polyfill

`pdfjs-dist` v4 依赖 `process.getBuiltinModule`，需要 polyfill。开发环境（`npm run dev`）通过 webpack 注入，生产环境（`npm start`）通过 `instrumentation.ts` 生命周期钩子注入。`server.js` 是备用的自定义入口（polyfill 时序更可控）。

### 单例模式与队列

Prisma 客户端和后台队列（`resume-parsing-queue.ts`、`screening-queue.ts`、`webhook-delivery-queue.ts`）使用 `globalThis` 单例以承受 Next.js HMR。队列在 `instrumentation.ts` 启动时初始化，自动恢复孤儿任务（上次崩溃后处于 `PARSING`/`SCREENING` 状态的简历）。

### 定时调度器

`node-cron` 实现，仅生产环境启动。全天候（含周末）每 30 分钟自动收取邮件（`0,30 * * * *`，Asia/Shanghai）。日志：`data/logs/scheduler-YYYY-MM-DD.log`。API：`POST /api/cron/scheduler`（需 `CRON_SECRET`）、`GET /api/cron/fetch-emails`。

### 邮件收取

IMAP 收取（`imapflow` + `mailparser`），增量 UID 追踪，`messageId` 去重。附件限 PDF/DOCX/DOC/JPG/PNG，>20MB 标记 ERROR。附件保存到 `data/uploads/{emailId}/`，创建 `Resume` 记录（状态 `UNPARSED`），触发解析流水线。控制台手动收取默认自动触发后续流程，cron 端点仅收取不自动处理。

### 文本提取

2 级回退：直接提取（PDF 走 `pdfjs-dist` v4 视觉排序提取器 `lib/services/pdf-visual-extractor.ts`，按视觉坐标分行/排序/双栏检测；DOCX 走 `mammoth`）→ Tesseract OCR（`pdfjs-dist` 渲染 + `tesseract.js`，`lib/services/ocr-engine.ts`）。5 项加权文本质量检测，得分 < 40 触发 OCR 回退。解析后质量门禁不达标 → ERROR。

### 数据加密

邮箱密码、AI API Key、Webhook URL 使用 AES-256-GCM 加密存储（`lib/services/encryption.ts`），密钥来自 `ENCRYPTION_KEY`。

### AI 配置

数据库多配置，按 `purposes` 分类（`screening`、`extraction`、`ocr`）。解析优先级：显式指定 → 默认配置 → 同用途首个 → `screening` 回退（`extraction`/`ocr`）→ 环境变量回退（`ocr` 无环境变量回退）。

### 任务批次

5 种类型：`scheduled`、`manual`、`parse`、`rescreen`、`reevaluate`。编号格式 `YYYYMMDD-NNN`。前端页面 `app/resume/task-batches/`，3 秒自动刷新。

### Webhook 集成

`WebhookIntegration` 配置（替代原企业微信专属的 `WeComFieldMapping`）：
- 字段映射：5 种转换（DIRECT / ENUM_MAP / TIMESTAMP / CONCAT / FIXED）
- 配置分组：`configKey` 支持多套下游并行（如同时推送企微 + 自建表格）
- 触发条件：跟进进入「待面试」及之后阶段
- 推送目标：任意支持 Webhook 的系统（企微、飞书、Slack、自建表格、webhook.site 等）

## 数据模型要点

数据库为 SQLite，注意三大约束：**不支持并发写**（队列并发=1，PM2 用 fork 单实例）、**无迁移**（直接用 `db push`）、**无 ALTER COLUMN**（改字段需重建表）。

### 核心概念

**冰山模型**：可见层 `knowledge`（知识）、`skill`（技能）用于初筛；隐藏层 `selfAwareness`（自我认知）、`personality`（品质特质）、`values`（价值观）、`motivation`（动机）用于完整评估。权重按职位独立配置（`WeightModel`，category：`initial`/`iceberg`）。

**按职位评估**：同一简历可对多个职位分别评估（`@@unique([resumeId, positionId])`）。`PositionEvaluation` 存储得分和 AI 分析，`EvaluationDimension` 存储维度评分（1-5 星，AI/手动来源）。`PositionEvaluation` 与 `FollowUpRecord` 一一对应（via `evaluationId`），跟进记录挂在评估上而非简历上。

**跟进标签**：3 大分类（`hard`、`intent`、`custom`），`tag-detector.ts` 基于确定规则自动打标。

**跟进状态机**（10 状态）：`CONTACTING → INTERVIEW_SCHEDULED → INTERVIEWED → OFFER_SENT → PENDING_ONBOARD → HIRED → RESIGNED`，任意状态可转 `UNSUITABLE` / `INTERVIEW_CANCELLED` / `OFFER_REJECTED`。详见 `lib/services/follow-up-transitions.ts`。

### 废弃字段

`Resume` 上的 `initialScore`、`compositeScore` 已废弃，改用 `PositionEvaluation.initialScore` / `PositionEvaluation.compositeScore`。`screenedDate` 已废弃，改用 `PositionEvaluation.screenedAt`。

### 数据目录

| 路径 | 内容 |
|------|------|
| `prisma/data/resume.db` | SQLite 数据库 |
| `data/uploads/` | 邮件简历附件 |
| `data/logs/` | 调度器日志 |
| `data/.crash-state-*.json` | 队列崩溃恢复状态 |
| `public/photos/` | 候选人照片 |

## 简历状态流转

```
UNPARSED → PARSING → PENDING → SCREENING → SCREENED
                            ↑         ↑
                     UNASSIGNED     ERROR
```

- `UNASSIGNED`：未分配职位，不参与筛选
- `UNPARSED` → `PARSING` → `PENDING`：收取 → 解析 → 待筛选
- `SCREENING` → `SCREENED`：筛选中 → 完成（结果在 `PositionEvaluation`）
- `ERROR`：解析失败或文本质量过低
- 已废弃：`PARSED`（→PENDING）、`PASSED`/`FAILED`（→SCREENED）

## API 路由

10 组，均在 `app/api/` 下：`config/`、`cron/`、`dashboard/`、`emails/`、`evaluations/`、`follow-up/`、`positions/`、`prompts/`、`resumes/`、`task-batches/`、`webhooks/`。

## 前端结构

- **入口**：`app/page.tsx` 为品牌着陆页（介绍 + CTA 进控制台）；`app/resume/*` 为控制台
- **组件**：`components/ui/`（shadcn/ui 基础组件）、`components/resume/`（业务组件）、`components/providers.tsx`（React context）
- **导航**：`app/resume/layout.tsx` 侧边栏 + 移动端顶部，5 组（数据概览→dashboard、系统配置→system-config、招聘中心→list/screened/follow-up/reevaluate、任务管理→task-batches、邮件管理→emails），`usePathname` 活跃检测，`<Toaster />`（sonner）全局通知
- **样式**：Tailwind CSS + CSS 变量，**石墨主题**配色（深石墨侧边栏 / 蓝紫点缀 accent，极简 · 高级），设计令牌定义在 `app/globals.css` 的 `:root` 中，`tailwind.config.ts` 已注册 `sidebar` / `success` / `warning` / `info` 色系。UI 迭代清单见 `ui重新设计.md`（重构批次 B12 执行子文档）

## 部署

### 本地开发（推荐）

`npm run dev`（端口 3000，挂载项目目录，HMR 即时生效）。

### 生产构建

```bash
npm run build
npm run start
```

### PM2（可选）

`pm2 start npm --name "resume-glacier" -- run start`，**`exec_mode: 'fork'`**（SQLite 不支持多进程共享）。需手动创建 `public/photos/`、`data/uploads/` 目录和 `.env` 文件。

## 文档

- `README.md` — 项目介绍、快速开始、API 概览
- `CONTRIBUTING.md` — 贡献指南、编码规范、提交规范
- `LICENSE` — MIT 许可证
- `REVIEW.md` — 代码审查 Agent 指引