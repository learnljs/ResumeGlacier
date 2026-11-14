# 多配置 + 简历来源重构（已完成）

## Context

系统已完成从单配置到多配置的重构，支持：
1. AI 模型配置独立页面，支持多个模型配置（含默认标记）
2. 邮箱配置支持多个邮箱，增加别名和简历来源关联
3. 新增"简历来源"独立配置，配置不同来源平台的 AI 解析提示词和邮件主题解析规则
4. 简历列表/详情展示来源和收取邮箱信息
5. 简历状态流重新设计：PARSED → PENDING → SCREENING → PASSED/FAILED
6. 简历列表增强：4选项卡、双击查看、强制解析、多选批量操作、行内职位编辑

## 一、数据库 Schema 变更 (`prisma/schema.prisma`)

### 新增模型

```prisma
model ResumeSource {
  id             String        @id @default(cuid())
  name           String        @unique  // "BOSS直聘", "智联招聘", "猎聘"
  description    String?       // 来源描述
  promptTemplate String?       // AI解析提示词模板
  subjectPattern String?       // 邮件主题正则，用于提取候选人姓名（第一个捕获组）
  isActive       Boolean       @default(true)
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  emailConfigs   EmailConfig[]
  resumes        Resume[]
}
```

#### subjectPattern 使用说明

`subjectPattern` 是一个正则表达式，用于从邮件主题中提取候选人姓名。第一个捕获组 `(...)` 的内容为姓名。

示例：
- BOSS直聘主题格式：`陈华园 | 3年，应聘 跨境财税规划助理 | 广州10-15K【BOSS直聘】`
  - 正则：`^(.+?)\s*\|`
  - 提取结果：`陈华园`

该规则在以下场景自动应用：
1. **邮件抓取时**（email-fetcher）：解析简历后，若文件内容中未提取到姓名，则尝试从邮件主题提取
2. **重新解析时**（reparse API）：force 模式下重新解析后同样应用主题提取

### 修改模型

**EmailConfig** — 新增字段：
- `alias String` — 邮箱别名 (如 "HR招聘邮箱")
- `resumeSourceId String?` FK→ResumeSource
- `resumeSource` relation
- `emails Email[]` relation
- `resumes Resume[]` relation
- 语义变化：`isActive` 不再是单例开关，多个可同时为 true

**AIConfig** — 新增字段：
- `alias String` — 模型别名 (如 "DeepSeek主力")
- `isDefault Boolean @default(false)` — 默认筛选模型

**Email** — 新增字段：
- `emailConfigId String?` FK→EmailConfig — 来源邮箱配置

**Resume** — 新增字段（反范式化，方便查询展示）：
- `resumeSourceId String?` FK→ResumeSource
- `emailConfigId String?` FK→EmailConfig

**ScreeningResult** — 新增字段：
- `aiConfigId String?` FK→AIConfig

所有新增 FK 均为 nullable，旧数据不受影响，UI 显示"未知"。

## 二、API 路由变更

### 新增路由

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/config/resume-sources` | GET/POST | 来源列表/新增 |
| `/api/config/resume-sources/[id]` | GET/PUT/DELETE | 来源CRUD |
| `/api/config/email/[id]` | PUT/DELETE | 编辑/删除单个邮箱 |
| `/api/config/ai/[id]` | PUT/DELETE | 编辑/删除单个模型 |

### 修改路由

- **GET `/api/config/email`** → 返回所有邮箱配置数组（含 alias、resumeSource.name）
- **POST `/api/config/email`** → 新增配置（不再清除旧的），必填 alias
- **GET `/api/config/ai`** → 返回所有 AI 配置数组（含 alias、isDefault）
- **POST `/api/config/ai`** → 新增配置，必填 alias；若 isDefault=true 则取消其他默认
- **POST `/api/emails/fetch`** → 接受可选 `emailConfigId`，不传则遍历所有 active 邮箱
- **POST `/api/resumes/[id]/screen`** → 接受可选 `aiConfigId` 指定用哪个模型
- **GET `/api/resumes`** → 新增 `resumeSourceId`、`emailConfigId` 过滤参数，include 新关联；支持特殊过滤 `positionId=UNASSIGNED`（未分配）和 `status=SCREENED`（已筛选=PASSED+FAILED）
- **GET `/api/resumes/[id]`** → include resumeSource 和 emailConfig
- **PUT `/api/resumes/[id]/assign`** → 分配职位时自动将 PARSED 状态转为 PENDING
- **POST `/api/resumes/[id]/reparse`** → 支持 `{ force: boolean }` 参数；include email.subject + resumeSource.subjectPattern 用于主题提取；解析成功状态 → PARSED
- **POST `/api/resumes/batch-reparse`** → 接受 `{ ids?: string[], force?: boolean }`；指定 ids 时解析指定简历（支持强制解析任意状态），否则查找所有 ERROR 状态；支持主题提取候选人姓名
- **GET `/api/dashboard/stats`** → 新增 `parsedResumes` 计数（status=PARSED）
- **POST/GET `/api/config/resume-sources`** → 创建/列表时处理 subjectPattern 字段
- **PUT `/api/config/resume-sources/[id]`** → 更新时处理 subjectPattern 字段

## 三、核心服务变更

### `lib/services/email-fetcher.ts`

- `fetchEmails(emailConfigId?: string)` → 支持指定邮箱或遍历所有 active
- 抽取 `fetchFromConfig(config)` 内部函数
- 创建 Email 时写入 `emailConfigId`
- 创建 Resume 时写入 `emailConfigId` + `resumeSourceId`（从 config.resumeSourceId 获取）
- 查询 config 时 include `resumeSource: { select: { id: true, subjectPattern: true } }`
- 解析后应用 `extractCandidateNameFromSubject(subject, subjectPattern)` 提取候选人姓名（当文件内容未提取到姓名时）
- 初始状态：解析成功 → **`PARSED`**（非 PENDING），表示内容已解析但尚未分配职位

### `lib/services/resume-parser.ts`

- 新增 `extractCandidateNameFromSubject(subject: string, pattern: string): string | null`
- 使用 `new RegExp(pattern)` 匹配邮件主题，返回第一个捕获组内容
- 正则异常时静默忽略返回 null

### `lib/services/ai-screener.ts`

- `getAIConfig(aiConfigId?: string)` → 指定ID > isDefault > 首个 active > env fallback
- `screenResume` 扩展 input 接受 `aiConfigId`
- 查 resume 的 resumeSource.promptTemplate 注入到 prompt
- 保存 ScreeningResult 时写入 `aiConfigId`

### `lib/prompts/screening.ts`

- `buildScreeningUserPrompt` 增加可选参数 `sourcePromptTemplate?: string`
- 在简历内容后、JSON格式说明前插入：

```
## 简历来源平台格式说明
{sourcePromptTemplate}
```

## 四、页面/导航变更

### 侧边栏导航 (`app/resume/layout.tsx`)

```
数据概览    /resume/dashboard      BarChart3
邮箱配置    /resume/email-config   Mail
简历来源    /resume/sources        Layers
AI 模型     /resume/ai-config      Bot
职位管理    /resume/positions      Briefcase
简历列表    /resume/list           FileText
```

### 新增页面

**`app/resume/email-config/page.tsx`** — 多邮箱管理
- 邮箱列表卡片（别名、邮箱地址、关联来源 badge、最后收取时间、启用状态）
- 新增/编辑表单（新增「别名」+「简历来源」下拉，复用现有 IMAP 表单）
- 每个邮箱的"收取"按钮 + "全部收取"按钮

**`app/resume/ai-config/page.tsx`** — 多模型管理
- 模型列表卡片（别名、服务商+模型、Base URL、默认 badge、启用状态）
- 新增/编辑表单（新增「别名」，复用现有服务商选择器+模型+API Key 表单）
- "设为默认"操作

**`app/resume/sources/page.tsx`** — 简历来源管理
- 来源列表（名称、描述、提示词预览、关联邮箱数、简历数）
- 新增/编辑表单：名称 + 描述 + 提示词 textarea + **邮件主题解析规则**（subjectPattern 正则输入框，含使用说明）

### 修改页面

**`app/resume/list/page.tsx`**
- 新增过滤项：简历来源下拉、邮箱下拉
- 表格新增"来源"列（ResumeSource name badge）
- 邮件主题下方显示邮箱别名
- **4个选项卡**：所有（无默认筛选）、待筛选（status=PENDING）、未分配（positionId=UNASSIGNED）、已筛选（status=SCREENED，含PASSED+FAILED）
- **双击查看**：双击表格行跳转到简历详情页
- **强制解析**：单个操作按钮 + 多选复选框批量强制解析（调用 batch-reparse 接口带 ids + force）
- **行内职位编辑**：未分配职位的简历在表格中直接下拉选择职位（min-w-[160px] h-8），已分配的只读显示 Badge
- **分配后自动状态转换**：分配职位时 PARSED → PENDING；在"未分配"选项卡中编辑后自动刷新列表
- **PARSED 状态显示**：紫色标签，标记为"已解析"

**`app/resume/detail/[id]/page.tsx`**
- 候选人信息卡新增：来源名称、收取邮箱别名
- AI 筛选按钮增加模型选择下拉（从 active AIConfig 列表获取，默认选 isDefault）
- 新增 PARSED 状态显示配置（紫色标签）

**`app/resume/dashboard/page.tsx`**
- 邮箱状态：显示所有 active 邮箱别名列表 + 各自最后收取时间
- "手动收取"按钮收取所有邮箱
- 新增来源维度统计
- 新增 parsedResumes 统计（已解析待分配数量）
- 统计卡片"待处理"显示 parsed + pending 分项明细

**`app/resume/config/page.tsx`** → 改为 redirect 到 `/resume/email-config`

## 五、实施顺序（全部已完成）

### Phase 1：Schema + Migration ✓
1. 更新 prisma/schema.prisma（含 subjectPattern 字段）
2. `npx prisma db push` + `npx prisma generate`
3. 迁移脚本：现有 EmailConfig 的 alias 填充为 user 值，现有 AIConfig alias 填充为 provider+model

### Phase 2：API 后端 ✓
4. ResumeSource CRUD API（2 个路由文件，含 subjectPattern）
5. EmailConfig API 改造（列表/新增/编辑/删除）
6. AIConfig API 改造（列表/新增/编辑/删除）
7. email-fetcher 服务改造（多邮箱 + 主题提取 + PARSED 状态）
8. ai-screener 服务改造 + prompt 模板注入
9. resumes API 更新（过滤+include+UNASSIGNED/SCREENED 特殊过滤）
10. reparse API 改造（force 模式 + 主题提取 + PARSED 状态）
11. batch-reparse API 改造（ids 数组 + force 模式 + 主题提取）
12. assign API 改造（PARSED→PENDING 自动转换）
13. dashboard stats API 改造（新增 parsedResumes 计数）

### Phase 3：UI 新页面 ✓
14. 简历来源管理页（含 subjectPattern 输入）
15. AI 模型配置页
16. 邮箱配置页（多邮箱）
17. 更新侧边栏导航

### Phase 4：UI 修改页面 ✓
18. 简历列表页（4选项卡 + 来源列 + 过滤 + 双击查看 + 强制解析 + 多选批量 + 行内职位编辑 + PARSED 状态）
19. 简历详情页（来源信息 + 模型选择器 + PARSED 状态）
20. Dashboard（多邮箱状态 + 来源统计 + parsedResumes）
21. 旧 /resume/config 重定向

### Phase 5：验证 ✓
22. 构建验证 `npm run build`

## 六、简历状态流变更

```
原状态流：PENDING → SCREENING → PASSED / FAILED / ERROR

新状态流：
  邮件抓取/解析成功 → PARSED（已解析：内容已提取，尚未分配职位）
                        ↓ 分配职位（assign API 自动转换）
                     PENDING（待筛选：已解析 + 已分配职位）
                        ↓ AI筛选
                     SCREENING → PASSED / FAILED
  任何阶段解析失败 → ERROR
  强制重新解析 → PARSED（重置为已解析）
```

关键变化：
- 新增 **PARSED** 状态：简历文件内容已成功解析提取，但尚未分配职位
- **PENDING** 重新定义：已解析内容 **且** 已分配职位，等待 AI 筛选
- 分配职位时自动转换：`PARSED → PENDING`
- 初始抓取/强制重新解析后状态为 `PARSED`（非 PENDING）

## 七、关键文件清单

- `prisma/schema.prisma`
- `lib/services/email-fetcher.ts`
- `lib/services/resume-parser.ts` (新增 extractCandidateNameFromSubject)
- `lib/services/ai-screener.ts`
- `lib/prompts/screening.ts`
- `app/resume/layout.tsx`
- `app/resume/email-config/page.tsx`
- `app/resume/ai-config/page.tsx`
- `app/resume/sources/page.tsx`
- `app/api/config/resume-sources/route.ts`
- `app/api/config/resume-sources/[id]/route.ts`
- `app/api/config/email/[id]/route.ts`
- `app/api/config/ai/[id]/route.ts`
- `app/api/config/email/route.ts`
- `app/api/config/ai/route.ts`
- `app/api/emails/fetch/route.ts`
- `app/api/resumes/route.ts`
- `app/api/resumes/[id]/route.ts`
- `app/api/resumes/[id]/screen/route.ts`
- `app/api/resumes/[id]/assign/route.ts`
- `app/api/resumes/[id]/reparse/route.ts`
- `app/api/resumes/batch-reparse/route.ts`
- `app/api/dashboard/stats/route.ts`
- `app/resume/list/page.tsx`
- `app/resume/detail/[id]/page.tsx`
- `app/resume/dashboard/page.tsx`
- `app/resume/config/page.tsx` (redirect)
