# REVIEW.md

本文档为代码审查 Agent 提供指引，帮助审查者快速定位项目文档、理解编码规范和架构约定。

---

## 1. 产品 Spec 来源

**入口**：`README.md` + 顶层 `CONTRIBUTING.md` 中描述的核心功能与数据模型

产品需求散落在 README 与代码注释中，审查时应以此为准，判断实现是否满足产品需求。

---

## 2. 技术 Spec 文档

**目录**：`docs/`（架构与开发方案文档）

按功能模块组织。审查时应验证实现是否与 Spec 一致，特别注意数据结构、API 设计和状态流转。

---

## 3. 项目编码规范与架构规范

详见项目根目录 `CLAUDE.md` 与 `CONTRIBUTING.md`，核心要点如下：

### 3.1 审查要点

1. **Spec 一致性**：实现是否与 `docs/` 下对应 Spec 保持一致，API 设计、数据模型、状态流转是否吻合
2. **命名规范遵循**：`lib/services/` 下 kebab-case、组件 PascalCase、API RESTful 风格
3. **架构合规**：数据库操作是否考虑 SQLite 约束（无并发写、无 `ALTER COLUMN`），是否遵循组件分层（`ui/` vs `resume/`）
4. **边界与异常**：错误处理是否完善，文本解析质量门禁、队列崩溃恢复、邮箱收取失败、Webhook 推送失败等异常路径是否覆盖
5. **确定性逻辑**：重试策略、路由、阈值、硬条件、规则打标必须写成显式代码，不交给模型
6. **样式规范**：使用 `cn()` 合并 className，设计令牌（颜色、圆角、阴影）必须在 `app/globals.css` 中定义后引用

### 3.2 命名规范

| 类别 | 规范 | 示例 |
|------|------|------|
| 服务文件 | `lib/services/` 下 kebab-case | `ai-screener.ts`、`tag-detector.ts` |
| React 组件 | PascalCase | `FollowUpTable.tsx`、`ScoreCards.tsx` |
| API 路由 | RESTful 风格 | `app/api/resumes/`、`app/api/evaluations/` |
| 路径别名 | `@/*` 映射项目根目录 | `import { cn } from '@/lib/utils'` |

### 3.3 项目约定

- **语言**：UI 文本、commit message、代码注释均使用中文
- **提交**：遵循 Conventional Commits（`feat:`、`fix:`、`refactor:`、`docs:`、`style:`、`perf:`）
- **样式**：使用 `cn()`（clsx + tailwind-merge）合并 className
- **Prisma**：无迁移，直接用 `prisma db push`；schema 变更后需 `prisma generate`
- **验证**：`npm test` 跑 Vitest 纯函数单测；`npm run test:e2e` 跑 Playwright 冒烟；页面级验证可用 Playwright MCP

### 3.4 架构要点

- **技术栈**：Next.js 16 + TypeScript + SQLite + Prisma，全栈 Web 应用
- **数据库约束**：SQLite 不支持并发写，解析队列并发=1；无 `ALTER COLUMN`，改字段需重建表
- **单例模式**：Prisma 客户端和后台队列使用 `globalThis` 单例以承受 Next.js HMR
- **加密**：邮箱密码、AI API Key、Webhook URL 使用 AES-256-GCM 加密（`lib/services/encryption.ts`）
- **队列**：`resume-parsing-queue.ts`（解析）、`screening-queue.ts`（筛选）、`webhook-delivery-queue.ts`（Webhook 推送）
- **定时任务**：`node-cron`，仅生产环境启动，全天候每 30 分钟收取邮件
- **组件分层**：`components/ui/`（shadcn/ui 基础组件）、`components/resume/`（业务组件）、`components/providers.tsx`（React context）

### 3.5 关键数据模型

- **冰山模型 6 维度**：知识(knowledge)、技能(skill)、自我认知(selfAwareness)、品质(personality)、价值观(values)、动机(motivation)
- **按职位评估**：同一简历可对多个职位分别评估（`PositionEvaluation`），`@@unique([resumeId, positionId])`
- **跟进状态机**（10 状态）：`CONTACTING → INTERVIEW_SCHEDULED → INTERVIEWED → OFFER_SENT → PENDING_ONBOARD → HIRED → RESIGNED`，任意状态可转 `UNSUITABLE` / `INTERVIEW_CANCELLED` / `OFFER_REJECTED`
- **Webhook 集成**：`WebhookIntegration` 配置字段映射，5 种转换类型（DIRECT / ENUM_MAP / TIMESTAMP / CONCAT / FIXED），`configKey` 分组支持多下游并行
- **废弃字段**：`Resume.initialScore`/`compositeScore` 已废弃，改用 `PositionEvaluation` 对应字段；`Resume.screenedDate` 改用 `PositionEvaluation.screenedAt`

---

## 4. 前端风格规范

### 4.1 样式体系

- **CSS 框架**：Tailwind CSS 3.4，搭配 `tailwindcss-animate` 动画插件
- **CSS 变量**：设计令牌定义在 `app/globals.css` 的 `:root` 中，使用 HSL 颜色空间
- **className 合并**：统一使用 `cn()` 工具函数（`lib/utils.ts`，基于 clsx + tailwind-merge）

### 4.2 设计令牌（Design Tokens）

**石墨主题**配色（极简 · 高级）：

| 令牌类别 | 变量 | HSL | 对应色 |
|----------|------|-----|--------|
| 主色 | `--primary` | 220 18% 22% | 石墨近黑（主按钮/选中） |
| 强调色 | `--accent` | 250 55% 48% | 蓝紫（品牌点缀） |
| 危险色 | `--destructive` | 0 75% 55% | 标准红（错误） |
| 成功色 | `--success` | 150 65% 35% | 翠绿（成功） |
| 警告色 | `--warning` | 38 85% 52% | 琥珀（待定） |
| 信息色 | `--info` | 210 80% 50% | 蓝（进行中） |
| 侧边栏 | `--sidebar` | 220 12% 12% | 深石墨 |
| 背景色 | `--background` | 220 20% 99% | 冷白 |
| 圆角 | `--radius` | 0.5rem | 默认圆角 |
| 字体 | fontFamily | 'Inter', 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif | 中英文混排栈 |

### 4.3 组件规范

- UI 基础组件遵循 **shadcn/ui** 模式（`components/ui/`），基于 Radix UI 原语
- 图标使用 **lucide-react**
- Toast 通知使用 **sonner**（`<Toaster />`）
- 图表使用 **recharts**
- 图表系列颜色统一使用 `--chart-1` 至 `--chart-10` CSS 变量（定义在 `globals.css`，已映射到石墨主题）

### 4.4 阴影与动效

| 类名 | 用途 |
|------|------|
| `.shadow-soft` | 柔和阴影，用于卡片/面板 |
| `.shadow-card` | 卡片悬浮阴影 |
| `.text-brand-gradient` | 品牌渐变文字（hero 标题用） |
| `.divider-soft` | 极简分隔线（左右渐隐） |
| `.scrollbar-hide` | 隐藏滚动条 |
| `animate-slide-in-right` | 从右侧滑入 |
| `animate-slide-out-right` | 向右侧滑出 |
| `animate-fade-in` | 淡入效果 |

---

## 5. 本地运行与数据变更

本项目定位为单机本地运行，**不提供** Docker 镜像、容器编排、PM2 守护，也不区分测试环境 / 正式环境的上线流程。审查时不要引用 `deploy/` 目录，也不要要求产出分环境部署脚本。

### 5.1 启动方式

- **日常开发**：`npm install` + `npm run db:setup` + `npm run dev`，端口 3000
- **打包运行**：`npm run build` + `npm run start`，端口 3000

### 5.2 数据库变更与备份

- schema 变更统一走 `npm run db:setup`（`prisma db push`），不产出分环境 SQL 脚本
- 需手动创建 `public/photos/`、`data/uploads/` 目录和 `.env` 文件
- **务必同时备份 `ENCRYPTION_KEY`**，否则加密字段无法恢复
- SQLite 不支持并发写，保持单实例运行

---

## 6. Webhook 集成审查要点

由于本项目将原企业微信专属集成通用化为 Webhook 集成，审查时请特别关注：

1. **配置灵活性**：`WebhookIntegration` 表的字段是否覆盖所有下游场景
2. **转换引擎正确性**：5 种字段转换（DIRECT/ENUM_MAP/TIMESTAMP/CONCAT/FIXED）的实现是否符合预期
3. **多下游并行**：`configKey` 分组机制是否能正确支持同时推送到多个目标
4. **失败重试**：指数退避重试（最多 3 次）是否覆盖
5. **触发时机**：仅在跟进进入「待面试」及之后阶段触发，首次新增 vs 之后更新的区分是否正确
6. **敏感数据**：Webhook URL 必须加密存储，不应在日志中明文出现