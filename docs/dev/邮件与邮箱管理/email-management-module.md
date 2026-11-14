# 邮件管理模块实施计划

## Context

当前系统通过 IMAP 收取邮件后，同步进行简历解析（`parseResume`），解析耗时过长导致邮件收取效率低下。需要：
1. 将邮件收取与简历解析解耦（收取后只生成未解析的简历）
2. 新增邮件管理模块（列表、状态、操作）
3. 在招聘中心简历列表中增加未解析/正在解析的异步处理机制
4. 统一数据概览中「手动收取邮件」的行为

## 状态扩展

新增两个简历状态（无需 schema 迁移，`status` 为 String 类型）：
- `UNPARSED` → 未解析（邮件收取后生成的简历，尚未解析） 
- `PARSING` → 正在解析（后台异步解析中）

## 实施步骤

### Step 1: 修改邮件收取服务 — 跳过解析，简历状态改为 UNPARSED

**文件**: `lib/services/email-fetcher.ts`

- 在 `fetchEmailsForConfig()` 中添加 `full?: boolean` 参数
  - `full=true`: 忽略 `lastFetchedUid`，使用 `{ uid: '1:*' }` 搜索所有邮件，不限时间
  - 默认 `false`（增量模式，保持现有行为）
- 在附件处理流程中，创建 Resume 后 **跳过** `parseResume()` 调用
- 将简历初始状态改为 `'UNPARSED'`（原来为 `'PARSED'`）
- 保留文件保存、Email 和 Resume 记录创建
- 跳过解析后的候选信息提取、职位匹配、AI 结构化提取
- `FetchResult` 接口：将 `parsed` 改为 `generated`（生成的简历数）

### Step 2: 修改邮件收取 API — 支持全量模式

**文件**: `app/api/emails/fetch/route.ts`

- POST body 增加可选 `full?: boolean` 参数
- 传递给 `fetchEmails()` → `fetchEmailsForConfig()`
- 更新返回的 toast 文案适配新流程

**文件**: `app/api/cron/fetch-emails/route.ts`

- 无需修改，走增量模式（默认）
- 同样联动更新返回数据

### Step 3: 新增邮件列表 API

**文件**: `app/api/emails/route.ts` (新建)

- `GET`: 返回邮件列表，支持分页和筛选
  - 筛选参数: `fromName`, `subject`, `receivedAtStart`, `receivedAtEnd`
  - 分页参数: `page`, `pageSize`
  - 排序: `receivedAt` desc
  - 返回 `{ items: Email[], pagination: { page, pageSize, total, totalPages } }`
  - 包含关联的 resume 信息（id, candidateName, status）

### Step 4: 新增邮件删除 API

**文件**: `app/api/emails/[id]/route.ts` (新建)

- `DELETE`: 删除邮件及其关联的简历
  - 级联删除简历记录
  - 清理上传的文件（`data/uploads/{emailId}/`）
  - 返回 `{ success: true }`

### Step 5: 新增「生成简历」API

**文件**: `app/api/emails/[id]/generate-resume/route.ts` (新建)

- `POST`: 重新生成简历记录（先删后建）
  - 先删除该邮件所有关联的 Resume 记录（级联清理 ScreeningResult）
  - 不删除附件文件，复用已保存的文件
  - 遍历 `data/uploads/{emailId}/` 下的文件，为每个文件创建新的 Resume 记录，状态为 `UNPARSED`
  - 返回 `{ resumes: Resume[] }`

### Step 6: 新增邮箱状态 API

**文件**: `app/api/emails/status/route.ts` (新建)

- `GET`: 返回所有活跃邮箱的状态信息
  - 每个邮箱: `{ id, alias, user, lastFetchedAt, lastFetchedUid, emailCount, resumeCount }`
  - emailCount: 该邮箱收取的邮件总数
  - resumeCount: 关联的简历总数

### Step 7: 新增简历异步解析队列

**文件**: `lib/services/resume-parsing-queue.ts` (新建)

- 参照 `screening-queue.ts` 模式
- `enqueue(resumeIds: string[])`: 加入解析队列
- 后台 worker:
  1. 设置简历状态为 `PARSING`
  2. 调用 `parseResume()` 解析文件
  3. 提取 candidates 信息
  4. 调用 `matchPositionByFileName()` 匹配职位
  5. 成功 → 更新状态为 `PENDING`/`PARSED`，写入解析结果
  6. 失败 → 更新状态为 `ERROR`，写入错误信息
- `getStatus()`: 返回队列长度、处理中、当前正在解析的简历 ID
- 全局单例（`globalThis` 模式）
- 启动时恢复孤儿（恢复所有 `PARSING` 状态的简历）

### Step 8: 新增简历解析触发 API

**文件**: `app/api/resumes/parse/route.ts` (新建) — 单简历解析

- `POST`: 接收 `{ resumeId }`，加入解析队列
- 返回 `{ success: true }`

**文件**: `app/api/resumes/batch-parse/route.ts` (新建) — 批量解析

- `POST`: 接收 `{ resumeIds: string[] }`，批量加入解析队列
- 返回 `{ queued: number }`

### Step 9: 初始化解析队列

**文件**: `instrumentation.ts`

- 在 `register()` 中导入并初始化 `resumeParsingQueue.init()`

### Step 10: 新增邮件列表页面

**文件**: `app/resume/emails/page.tsx` (新建)

- 表格布局（参照简历列表页面样式）
- 列：来源(fromName)、主题(subject)、接收时间(receivedAt)、关联简历、操作
- 筛选栏：
  - 来源搜索框 (fromName)
  - 主题搜索框 (subject)  
  - 接收时间范围选择 (receivedAt)
- 分页
- 操作列：
  - **删除**: `confirm()` 确认后调用 `DELETE /api/emails/[id]`
  - **查看对应简历**: `<Link href={/resume/detail/[resumeId]?from=/resume/emails}>` 
    - 如果邮件关联多个简历，显示每个的链接
    - 如果没有关联简历，按钮置灰
  - **生成简历**: 调用 `POST /api/emails/[id]/generate-resume`

### Step 11: 新增邮箱状态页面

**文件**: `app/resume/emails/status/page.tsx` (新建)

- 卡片布局，每张卡片展示一个邮箱：
  - 别名(alias)、邮箱地址(user)
  - 上次收取时间(lastFetchedAt)
  - 邮件总数(emailCount)、简历总数(resumeCount)
- 每张卡片含两个操作按钮：
  - **增量获取邮件**: `POST /api/emails/fetch` with `{ configId, full: false }`
  - **全量重新获取**: `POST /api/emails/fetch` with `{ configId, full: true }`

### Step 12: 更新侧边栏导航

**文件**: `app/resume/layout.tsx`

- 新增独立一级菜单项「邮件管理」（与「数据概览」「系统配置」「招聘中心」同级）:
  ```typescript
  {
    href: '/resume/email',        // 占位父路径，无实际页面
    label: '邮件管理',
    icon: Mail,
    children: [
      { href: '/resume/emails', label: '邮件列表' },
      { href: '/resume/emails/status', label: '邮箱状态' },
    ],
  }
  ```
- 需从 `lucide-react` 引入 `Mail` 图标

### Step 13: 更新简历列表 — 增加未解析和正在解析选项卡

**文件**: `app/resume/list/page.tsx`

- 新增 tab 定义：
  - `{ key: 'unparsed', label: '未解析' }` — 筛选 status=UNPARSED
  - `{ key: 'parsing', label: '正在解析' }` — 筛选 status=PARSING
- 新增状态值到 `statusOptions`、`statusColors`、`statusLabels`:
  - `UNPARSED: '未解析'`, `PARSING: '正在解析'`
- `unparsed` tab 中：
  - 表格操作列增加 **「解析」** 按钮
  - 点击后调用 `POST /api/resumes/batch-parse` 或 `POST /api/resumes/parse`
  - 单条解析和批量解析均支持
  - 操作后列表自动刷新
- `parsing` tab 中：
  - 自动每 5 秒刷新列表（参照 `screening` tab 的刷新模式）
  - 显示刷新间隔选择器（默认 5 秒）

### Step 14: 更新数据概览 — 对齐手动收取邮件

**文件**: `app/resume/dashboard/page.tsx`

- 更新 `statusConfig` 添加 `UNPARSED` 和 `PARSING`
- 「手动收取邮件」按钮：调用 `POST /api/emails/fetch`（增量模式，默认行为不变）
- 更新 toast 文案：`获取${t.fetched}封邮件, 生成${t.generated}份简历`
  - 去掉「解析」相关的提示

**文件**: `app/api/dashboard/stats/route.ts`

- 新增 `unparsedResumes` 和 `parsingResumes` 统计
- 返回结果增加这两个字段

### Step 15: 更新简历详情页 — 补充新状态

**文件**: `app/resume/detail/[id]/page.tsx`

- 更新 `statusConfig` 添加 `UNPARSED` 和 `PARSING`

### Step 16: 更新简历列表 API

**文件**: `app/api/resumes/route.ts`

- 确保 status 筛选支持 `UNPARSED` 和 `PARSING`
- tab 映射：`unparsed` → status=UNPARSED, `parsing` → status=PARSING

## 文件变更汇总

### 新建 (9 个文件)
| 文件 | 说明 |
|------|------|
| `app/api/emails/route.ts` | 邮件列表 API (GET) |
| `app/api/emails/[id]/route.ts` | 邮件删除 API (DELETE) |
| `app/api/emails/[id]/generate-resume/route.ts` | 生成简历 API (POST) |
| `app/api/emails/status/route.ts` | 邮箱状态 API (GET) |
| `app/api/resumes/parse/route.ts` | 单简历解析 API (POST) |
| `app/api/resumes/batch-parse/route.ts` | 批量解析 API (POST) |
| `app/resume/emails/page.tsx` | 邮件列表页面 |
| `app/resume/emails/status/page.tsx` | 邮箱状态页面 |
| `lib/services/resume-parsing-queue.ts` | 简历异步解析队列 |

### 修改 (10 个文件)
| 文件 | 说明 |
|------|------|
| `lib/services/email-fetcher.ts` | 跳过解析、支持全量模式、UNPARSED |
| `app/api/emails/fetch/route.ts` | 支持 full 参数 |
| `app/api/cron/fetch-emails/route.ts` | 联动调整 |
| `app/api/dashboard/stats/route.ts` | 新增 unparsed/parsing 统计 |
| `app/api/resumes/route.ts` | 支持 UNPARSED/PARSING 筛选 |
| `app/resume/dashboard/page.tsx` | statusConfig + toast 文案 |
| `app/resume/list/page.tsx` | 新增 tab + 解析操作 + 自动刷新 |
| `app/resume/detail/[id]/page.tsx` | statusConfig 补充 |
| `app/resume/layout.tsx` | 侧边栏新增邮件管理 |
| `instrumentation.ts` | 初始化解析队列 |

## 验证方案

1. **邮件收取解耦**: 点击「手动收取邮件」→ 确认简历状态为 UNPARSED，不会长时间阻塞
2. **邮件列表**: 访问 `/resume/emails` → 列表显示正常，筛选生效
3. **邮件操作**: 删除邮件 → 关联简历也被删除；生成简历 → 新 UNPARSED 简历出现
4. **邮箱状态**: 访问 `/resume/emails/status` → 卡片信息正确，增量/全量获取可用
5. **简历解析**: 在招聘中心 → 未解析 tab → 点击「解析」→ 状态变为 PARSING → 进入正在解析 tab → 完成后状态变为 PARSED/PENDING
6. **正在解析刷新**: 正在解析 tab 每 5 秒自动刷新
7. **导航**: 侧边栏新增独立「邮件管理」菜单，含「邮件列表」和「邮箱状态」子项
8. **回退**: 从邮件列表点击「查看简历」进入详情页 → 回退 → 回到邮件列表页
