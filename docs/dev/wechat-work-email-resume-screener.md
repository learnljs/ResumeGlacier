# 简历智能筛选系统 (Resume Screener)

## Context

基于 Next.js 16 (Turbopack) 构建的**简历智能筛选系统**，自动从企业微信邮箱通过 IMAP 获取简历附件，解析 PDF/Word 内容，通过 AI 根据招聘要求自动筛选评分。原有购物模块已完全移除，首页直接重定向到简历管理后台。

## 架构概览

```
企业微信邮箱 (IMAP) → 邮件抓取 → 简历解析(PDF/Word) → AI筛选(OpenAI) → Web管理界面
```

- 项目名：`resume-screener`
- 入口：`/` → 重定向到 `/resume/dashboard`
- 所有功能挂载在 `/resume/*` 路由下
- 使用 SQLite + Prisma 5 作为轻量级数据库
- 所有后端逻辑通过 Next.js API Routes 实现

## 技术选型

| 模块 | 技术方案 | 备注 |
|------|---------|------|
| 框架 | Next.js 16.1.1 (App Router, Turbopack) | TypeScript |
| 邮件获取 | `imapflow` (IMAP协议) | 连接 `imap.exmail.qq.com:993` |
| 邮件解析 | `mailparser` (`simpleParser`) | 解析邮件头/附件 |
| PDF解析 | `pdf-parse@1.1.1` | 必须用 v1，v2 依赖 DOMMatrix 浏览器 API |
| Word解析 | `mammoth` | `extractRawText` |
| AI筛选 | `openai` SDK (GPT-4o) | 可配置 base_url 和 model |
| 数据库 | SQLite + Prisma 5 ORM | Prisma 7 需要 Node ^20.19，不兼容 |
| 通知 | `sonner` (Toast) | |
| Markdown渲染 | `react-markdown` | |
| UI组件 | CVA (class-variance-authority) + Tailwind CSS | |

### 关键技术注意事项

1. **pdf-parse 必须使用 v1.1.1**：v2.x 依赖新版 `pdfjs-dist`，需要浏览器 API `DOMMatrix`，在 Node.js 服务端环境不可用
2. **pdf-parse 必须用 `createRequire` 加载**：Next.js Turbopack 会拦截普通 `require()` 调用，需要使用 `node:module` 的 `createRequire` 绕过 Turbopack 静态分析
3. **Prisma 必须使用 v5**：Prisma 7 要求 Node ^20.19，当前环境 Node 20.13 不兼容
4. **Next.js 16 动态路由参数**：`params` 是 `Promise<{ id: string }>`，必须 `await`
5. **Prisma CLI 读取 `.env` 不读 `.env.local`**：需要单独创建 `.env` 文件存放 DATABASE_URL

## 数据库模型 (Prisma)

7 个核心模型：

1. **EmailConfig** — 邮箱IMAP配置（多配置）：alias(别名), host, port, secure, user, password(AES-256-GCM加密存储), mailbox, lastFetchedUid, lastFetchedAt, isActive, resumeSourceId(FK→ResumeSource)
2. **AIConfig** — AI模型配置（多配置）：alias(别名), provider, model, apiKey(加密存储), baseUrl, isDefault, isActive
3. **ResumeSource** — 简历来源：name(唯一), description, promptTemplate(AI解析提示词), subjectPattern(邮件主题正则提取候选人姓名), isActive
4. **Position** — 招聘职位：title, department, description, requirements(筛选要求), keywords(邮件匹配关键词), isActive
5. **Email** — 邮件记录：messageId(唯一去重键), uid, fromAddress, fromName, subject, receivedAt, emailConfigId(FK→EmailConfig)
6. **Resume** — 简历：emailId, positionId, resumeSourceId, emailConfigId, candidateName/Phone/Email, fileName, fileType, filePath, fileSize, extractedText, status(**PARSED**/PENDING/SCREENING/PASSED/FAILED/ERROR)
7. **ScreeningResult** — AI筛选结果：resumeId(唯一), decision(PASS/FAIL/UNCERTAIN), score(0-100), summary, strengths(JSON), weaknesses(JSON), detailAnalysis(markdown), matchedKeywords(JSON), aiModel, tokenUsage, processingTime, aiConfigId(FK→AIConfig)

### 简历状态流转

```
邮件抓取/解析 → PARSED（已解析：内容已提取）
                  ↓ 分配职位
               PENDING（待筛选：已解析 + 已分配职位）
                  ↓ AI筛选
               SCREENING → PASSED / FAILED
任何阶段解析失败 → ERROR
```

- **PARSED**: 简历文件内容已成功解析提取，但尚未分配职位
- **PENDING**: 已解析内容且已分配职位，等待 AI 筛选
- **SCREENING**: AI 正在筛选中
- **PASSED / FAILED**: AI 筛选完成
- **ERROR**: 解析或处理过程中出错

## API 路由结构

```
app/api/
├── config/
│   ├── email/                 GET/POST 邮箱配置列表/新增（多配置，密码加密存储）
│   │   ├── [id]/              PUT/DELETE 编辑/删除单个邮箱配置
│   │   └── test/              POST 测试IMAP连接
│   ├── ai/                    GET/POST AI模型配置列表/新增（多配置）
│   │   └── [id]/              PUT/DELETE 编辑/删除单个AI配置
│   └── resume-sources/        GET/POST 简历来源列表/新增（含subjectPattern）
│       └── [id]/              GET/PUT/DELETE 来源CRUD（含subjectPattern）
├── positions/                 GET列表/POST创建
│   └── [id]/                  GET/PUT/DELETE（async params）
├── emails/fetch/              POST 手动触发收取邮件（可选emailConfigId，不传遍历所有active）
├── resumes/                   GET 简历列表(支持status/positionId/search/resumeSourceId/emailConfigId过滤+分页)
│   │                          特殊过滤: positionId=UNASSIGNED(未分配), status=SCREENED(已筛选=PASSED+FAILED)
│   ├── [id]/                  GET 详情（含email/position/screeningResult/resumeSource/emailConfig关联）
│   │   ├── screen/            POST 触发AI筛选（可选aiConfigId，async params）
│   │   ├── assign/            PUT 分配职位（PARSED→PENDING自动转换，async params）
│   │   └── reparse/           POST 重新解析（支持force模式+邮件主题提取候选人，状态→PARSED）
│   ├── batch-screen/          POST 批量筛选所有已分配职位的PENDING简历
│   └── batch-reparse/         POST 批量重新解析（接受ids数组+force参数，支持主题提取候选人）
├── dashboard/stats/           GET 统计数据（各状态计数含parsedResumes+职位统计+近期简历）
└── cron/fetch-emails/         GET 定时任务入口（CRON_SECRET验证）
```

## 页面结构

```
app/
├── page.tsx                    重定向到 /resume/dashboard
├── layout.tsx                  根布局（metadata: 简历智能筛选系统）
└── resume/
    ├── layout.tsx              侧边栏导航布局（数据概览/邮箱配置/简历来源/AI模型/职位管理/简历列表）
    ├── page.tsx                重定向到dashboard
    ├── dashboard/page.tsx      数据概览（统计卡片含parsedResumes+筛选分布+职位统计+近期简历+手动拉取按钮）
    ├── email-config/page.tsx   邮箱配置（多邮箱管理，别名+IMAP+关联来源+收取操作）
    ├── sources/page.tsx        简历来源管理（名称+描述+提示词+邮件主题解析规则subjectPattern）
    ├── ai-config/page.tsx      AI模型配置（多模型管理，别名+服务商+模型+默认标记）
    ├── config/page.tsx         重定向到 /resume/email-config
    ├── positions/page.tsx      职位管理（CRUD内联表单+要求textarea）
    ├── list/page.tsx           简历列表（4选项卡[所有/待筛选/未分配/已筛选]+双击查看详情+强制解析+多选批量解析+行内职位编辑）
    └── detail/[id]/page.tsx    简历详情（头部操作栏[重新解析+AI筛选]+候选人信息卡+Tab切换[AI分析/简历原文/邮件信息]+PARSED状态支持）
```

### 简历列表页功能详情 (`app/resume/list/page.tsx`)

- **4个选项卡**：
  - 所有：无默认筛选，显示全部过滤器（状态+职位+搜索）
  - 待筛选：默认 `status=PENDING`，隐藏过滤器
  - 未分配：默认 `positionId=UNASSIGNED`，隐藏过滤器
  - 已筛选：默认 `status=SCREENED`（含PASSED+FAILED），隐藏过滤器
- **双击查看**：双击表格行跳转到简历详情页
- **强制解析**：单个操作按钮 + 多选复选框批量强制解析
- **行内职位编辑**：未分配职位的简历在表格中直接下拉选择职位（min-w-[160px] h-8），已分配的只读显示 Badge；在"未分配"选项卡中编辑后自动刷新列表

## 核心服务模块

### 1. 邮件抓取 (`lib/services/email-fetcher.ts`)
- 支持多邮箱配置：`fetchEmails(emailConfigId?)` 可指定邮箱或遍历所有 active
- 内部抽取 `fetchFromConfig(config)` 处理单个邮箱
- 通过 `imapflow` 连接企业微信IMAP服务器
- 增量抓取：基于 lastFetchedUid 只获取新邮件，首次获取最近7天
- 通过 messageId 去重，跳过已存在的邮件
- 筛选 .pdf/.docx 附件（同时检查 filename 和 contentType）
- 保存附件到 `data/uploads/{emailId}/`
- 自动解析文本并提取候选人信息
- **邮件主题提取候选人姓名**：若 ResumeSource 配置了 subjectPattern，解析后用正则从邮件主题提取候选人姓名
- 初始状态：解析成功 → `PARSED`（非 PENDING），等待分配职位
- 创建 Resume 时写入 `emailConfigId` + `resumeSourceId`
- 拒绝 >20MB 的附件（标记ERROR）
- 提供 `testImapConnection()` 和 `fetchEmails()` 两个入口

### 2. 简历解析 (`lib/services/resume-parser.ts`)
- **PDF**: 通过 `createRequire` (from `node:module`) 加载 `pdf-parse@1.1.1`，绕过 Turbopack 模块重写
- **DOCX**: `mammoth.extractRawText` 提取文字
- 后处理：正则提取手机号(1[3-9]\d{9})/邮箱/中文姓名(2-4字)
- 文本清理：合并连续空行/空格，截断50000字符
- 扫描件检测：提取文字<10字符时标记错误
- **`extractCandidateNameFromSubject(subject, pattern)`**：根据正则从邮件主题提取候选人姓名，第一个捕获组为姓名。如 BOSS直聘主题 `陈华园 | 3年，应聘 ...【BOSS直聘】` 使用 `^(.+?)\s*\|` 提取

### 3. AI筛选 (`lib/services/ai-screener.ts`)
- 支持多模型配置：`getAIConfig(aiConfigId?)` 按 指定ID > isDefault > 首个active > env fallback 优先级
- 系统提示词（`lib/prompts/screening.ts`）：HR招聘专家角色，要求输出结构化JSON
- 用户提示词：职位描述+筛选要求+简历全文+可选的来源平台提示词模板
- 输出字段：decision, score(0-100), summary, strengths[], weaknesses[], detailAnalysis(markdown), matchedKeywords[]
- 决策映射：PASS→PASSED, FAIL→FAILED, UNCERTAIN→PENDING
- 速率控制：批量筛选时每次间隔1秒
- JSON解析容错：先尝试 JSON.parse，失败时用正则提取 `{...}` 块
- 保存 ScreeningResult 时写入 `aiConfigId`

### 4. 密码加密 (`lib/services/encryption.ts`)
- AES-256-GCM 加密/解密 IMAP 密码
- 使用 ENCRYPTION_KEY 环境变量（32字节hex）

### 5. 重新解析功能
- **单个重新解析** (`/api/resumes/[id]/reparse`): 重新读取磁盘文件，调用 parseResume 提取文本，更新候选人信息；支持 `force` 参数强制重新解析任意状态简历；应用 ResumeSource.subjectPattern 从邮件主题提取候选人姓名；解析成功状态 → `PARSED`
- **批量重新解析** (`/api/resumes/batch-reparse`): 接受 `{ ids?: string[], force?: boolean }` 参数，指定 ids 时解析指定简历，否则查找所有 ERROR 状态简历；支持主题提取候选人姓名；返回成功/失败计数

## UI 组件

基础组件 (`components/ui/`):
- `button.tsx` — CVA 多变体按钮
- `card.tsx` — 卡片组件（Card/CardHeader/CardTitle/CardContent）
- `badge.tsx` — 标签组件
- `input.tsx` — 输入框
- `textarea.tsx` — 多行文本框
- `select.tsx` — 下拉选择框
- `toaster.tsx` — Sonner toast 容器

## 邮箱配置页面增强

- **预设邮箱服务商选择器**：企业微信、QQ邮箱、163邮箱、Gmail、Outlook 等，自动填充 host/port/secure
- **连接状态指示卡**：显示当前配置状态和最后抓取时间
- **测试结果面板**：测试连接后显示成功/失败的可视化反馈
- **分区表单**：服务器设置和账号凭据分开显示
- **详细帮助文档**：每个邮箱服务商的配置说明

## 环境变量

### `.env.local`（Next.js 运行时使用）
```
DATABASE_URL="file:./data/resume.db"
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4o"
OPENAI_BASE_URL=""
ENCRYPTION_KEY="<32字节随机hex>"
CRON_SECRET="<随机字符串>"
```

### `.env`（Prisma CLI 使用）
```
DATABASE_URL="file:./data/resume.db"
```

## 配置文件

### `next.config.mjs`
```js
serverExternalPackages: ['imapflow', 'pdf-parse', 'mammoth', 'mailparser']
```

### `tsconfig.json`
- target: `es2017`（需支持 Set 迭代等 ES6+ 特性）

### `types/pdf-parse.d.ts`
- 自定义类型声明，因 `pdf-parse@1.1.1` 无 TypeScript 类型

## 已解决的技术问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| Prisma 7 安装失败 | 需要 Node ^20.19，当前 20.13 | 使用 Prisma 5 |
| Prisma CLI 找不到 DATABASE_URL | 只读 `.env` 不读 `.env.local` | 创建独立 `.env` |
| Next.js 16 路由参数类型错误 | `params` 变为 `Promise` | `const { id } = await params` |
| `DOMMatrix is not defined` | pdf-parse v2 依赖新版 pdfjs-dist | 降级到 pdf-parse@1.1.1 |
| `Cannot find module pdf-parse` | Turbopack 拦截 `require()` | 使用 `createRequire` from `node:module` |
| Set 迭代不支持 | tsconfig target es5 | 改为 es2017 |
| @types/mailparser 缺失 | 未安装声明包 | `npm i -D @types/mailparser` |
| msg.source 可能 undefined | imapflow 类型定义 | 添加 null check + continue |

## 文件清单

### 核心服务
- `lib/prisma.ts` — Prisma 客户端单例（防热重载连接泄漏）
- `lib/services/encryption.ts` — AES-256-GCM 密码加解密
- `lib/services/email-fetcher.ts` — IMAP 多邮箱抓取+附件保存+自动解析+主题提取候选人
- `lib/services/resume-parser.ts` — PDF/DOCX 文本提取+联系人信息正则+邮件主题姓名提取
- `lib/services/ai-screener.ts` — 多模型 AI 调用+结果解析+来源提示词注入
- `lib/prompts/screening.ts` — AI 系统/用户提示词模板（支持来源平台格式说明）

### API 路由 (20个)
- `app/api/config/email/route.ts` — 邮箱配置列表/新增（多配置）
- `app/api/config/email/[id]/route.ts` — 邮箱配置编辑/删除
- `app/api/config/email/test/route.ts` — 测试 IMAP 连接
- `app/api/config/ai/route.ts` — AI模型配置列表/新增
- `app/api/config/ai/[id]/route.ts` — AI模型配置编辑/删除
- `app/api/config/resume-sources/route.ts` — 简历来源列表/新增（含subjectPattern）
- `app/api/config/resume-sources/[id]/route.ts` — 简历来源CRUD（含subjectPattern）
- `app/api/positions/route.ts` — 职位列表/创建
- `app/api/positions/[id]/route.ts` — 职位详情/编辑/删除
- `app/api/emails/fetch/route.ts` — 手动触发拉取邮件（支持指定邮箱/全部）
- `app/api/resumes/route.ts` — 简历列表（过滤+分页+UNASSIGNED/SCREENED特殊过滤）
- `app/api/resumes/[id]/route.ts` — 简历详情（含来源+邮箱关联）
- `app/api/resumes/[id]/screen/route.ts` — 单个 AI 筛选（可选模型）
- `app/api/resumes/[id]/assign/route.ts` — 分配职位（PARSED→PENDING自动转换）
- `app/api/resumes/[id]/reparse/route.ts` — 单个重新解析（force模式+主题提取）
- `app/api/resumes/batch-screen/route.ts` — 批量 AI 筛选
- `app/api/resumes/batch-reparse/route.ts` — 批量重新解析（指定ids+force模式+主题提取）
- `app/api/dashboard/stats/route.ts` — 统计数据（含parsedResumes计数）
- `app/api/cron/fetch-emails/route.ts` — 定时任务入口

### 页面 (11个)
- `app/page.tsx` — 根页面（重定向）
- `app/resume/layout.tsx` — 管理后台侧边栏布局（6个导航项）
- `app/resume/page.tsx` — 重定向到 dashboard
- `app/resume/dashboard/page.tsx` — 数据概览（含PARSED状态统计）
- `app/resume/email-config/page.tsx` — 多邮箱管理（别名+IMAP+来源关联+收取）
- `app/resume/sources/page.tsx` — 简历来源管理（名称+描述+提示词+subjectPattern）
- `app/resume/ai-config/page.tsx` — AI模型管理（多模型+默认标记）
- `app/resume/config/page.tsx` — 重定向到 email-config
- `app/resume/positions/page.tsx` — 职位管理
- `app/resume/list/page.tsx` — 简历列表（4选项卡+双击+强制解析+多选+行内编辑）
- `app/resume/detail/[id]/page.tsx` — 简历详情（含PARSED状态+来源信息+模型选择）

### 配置/类型
- `prisma/schema.prisma` — 数据库模型（7个模型）
- `next.config.mjs` — Next.js 配置
- `tsconfig.json` — TypeScript 配置
- `types/pdf-parse.d.ts` — pdf-parse 类型声明
- `package.json` — 依赖清单
