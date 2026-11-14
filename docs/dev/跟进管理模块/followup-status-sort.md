# 跟进管理按"进入当前状态时间"排序 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 跟进管理列表从"按跟进记录创建时间降序"改为"按进入当前状态的时间降序"（每次状态变更刷新时间戳），解决重新跟进/状态流转后排序不反映最新动态的问题。

**Architecture:** `FollowUpRecord` 新增可空字段 `statusChangedAt DateTime?`，所有状态变更写入点显式写入 `new Date()`；列表查询改为 `orderBy: [{ statusChangedAt: 'desc' }, { createdAt: 'desc' }]`；一次性回填脚本为存量记录推导该字段（状态类日志 → unsuitableAt/resignedAt → createdAt 兜底）。不新增展示列，不同步企微。

**Tech Stack:** Next.js + TypeScript + Prisma + SQLite（无迁移，`prisma db push`；无自动化单元测试，验证走 tsc 类型检查 + Playwright MCP 端到端）。

## Global Constraints

- 所有命令在**本地环境**执行（用户本地直接 `npm run dev`，不用 Docker；Docker 用户等价替换为 `./dev.sh npx ...`）。
- 代码注释、UI 文本、commit message 使用**中文**；commit 遵循 Conventional Commits（`feat:`/`fix:` 等）。
- Prisma 无迁移机制：schema 变更后执行 `npx prisma db push` + `npx prisma generate`。
- 单字段编辑（备注/面试时间/入职时间/标签/联系结果/原因）**不得**刷新 `statusChangedAt`——仅状态变更刷新。
- 排序键：`statusChangedAt desc` → 二级 `createdAt desc`。回填完成后不允许存在 `statusChangedAt = null` 的记录（null 在 DESC 排序中沉底）。

---

### Task 1: Schema 新增 statusChangedAt 字段

**Files:**
- Modify: `prisma/schema.prisma:248-249`（FollowUpRecord 模型内）

**Interfaces:**
- Produces: `FollowUpRecord.statusChangedAt: DateTime | null`——列表排序依据，所有状态变更写入点写入 `new Date()`（Task 2 消费）。

- [ ] **Step 1: 修改 schema**

在 `FollowUpRecord` 模型的 `contacted` 与 `createdAt` 之间插入字段。旧内容：

```prisma
  contacted     String              @default("NOT_CONTACTED")  // "NOT_CONTACTED" | "CONTACTED" | "CONTACT_FAILED"
  createdAt     DateTime            @default(now())
```

替换为：

```prisma
  contacted     String              @default("NOT_CONTACTED")  // "NOT_CONTACTED" | "CONTACTED" | "CONTACT_FAILED"
  statusChangedAt DateTime?         // 进入当前状态的时间（每次状态变更刷新，列表排序依据）
  createdAt     DateTime            @default(now())
```

- [ ] **Step 2: 推送 schema 并重新生成客户端**

运行：
```bash
npx prisma db push
npx prisma generate
```
预期：`db push` 输出提示通过 `ALTER TABLE` 新增可空列，无报错、无数据重建警告。

- [ ] **Step 3: 验证字段存在**

```bash
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{const r=await p.followUpRecord.findFirst({select:{statusChangedAt:true}});console.log('字段可查询, 当前值:',r.statusChangedAt);await p.\$disconnect()})()"
```
预期：输出 `字段可查询, 当前值: null`（存量记录均为 null）。

- [ ] **Step 4: 提交**

```bash
git add prisma/schema.prisma
git commit -m "feat: FollowUpRecord 新增 statusChangedAt 字段用于列表排序"
```

---

### Task 2: 全部状态变更写入点写入 statusChangedAt

**Files:**
- Modify: `app/api/follow-up/records/[id]/route.ts:247-248`（PATCH 状态变更块）
- Modify: `app/api/follow-up/records/route.ts:237-244`（POST 已有记录更新/重新跟进）
- Modify: `app/api/follow-up/records/route.ts:267-274`（POST 新建记录）
- Modify: `app/api/follow-up/records/batch/route.ts:101-104`（批量创建）
- Modify: `lib/services/scheduler.ts:263-269`（定时任务自动离职）

**Interfaces:**
- Consumes: `FollowUpRecord.statusChangedAt`（Task 1）
- Produces: 所有新产生的状态变更都携带准确的操作时刻；存量记录仍为 null（Task 3 回填覆盖）

**注意**：本任务只改这 5 处状态写入点。`[id]/route.ts` 中 `onlyField(...)` 的单字段编辑分支（note/interviewTime/startDate/resignedAt/contacted/rejectReason/resignReason）一律**不**加。

- [ ] **Step 1: PATCH 状态变更块**（`[id]/route.ts`）

旧内容：

```ts
    // 构建更新数据
    const data: Record<string, unknown> = { status }
```

替换为：

```ts
    // 构建更新数据（状态变更时刷新 statusChangedAt，作为列表排序依据）
    const data: Record<string, unknown> = { status, statusChangedAt: new Date() }
```

- [ ] **Step 2: POST 已有记录更新**（`records/route.ts`，重新跟进路径）

旧内容：

```ts
        data: {
          status: effectiveStatus,
          note: note || null,
```

替换为：

```ts
        data: {
          status: effectiveStatus,
          statusChangedAt: new Date(),
          note: note || null,
```

- [ ] **Step 3: POST 新建记录**（`records/route.ts`）

旧内容：

```ts
      data: {
        evaluationId: effectiveEvaluationId!,
        resumeId: effectiveResumeId!,
        status: effectiveStatus,
        note: note || null,
```

替换为：

```ts
      data: {
        evaluationId: effectiveEvaluationId!,
        resumeId: effectiveResumeId!,
        status: effectiveStatus,
        statusChangedAt: new Date(),
        note: note || null,
```

- [ ] **Step 4: 批量创建**（`batch/route.ts`）

旧内容：

```ts
          await tx.followUpRecord.create({
            data: {
              evaluationId,
              resumeId,
              tags: {
```

替换为：

```ts
          await tx.followUpRecord.create({
            data: {
              evaluationId,
              resumeId,
              statusChangedAt: new Date(),
              tags: {
```

- [ ] **Step 5: 定时任务自动离职**（`scheduler.ts`）

旧内容：

```ts
        await prisma.followUpRecord.update({
          where: { id: record.id },
          data: {
            status: 'RESIGNED',
            wecomSyncStatus: 'NOT_SYNCED',
          },
        })
```

替换为：

```ts
        await prisma.followUpRecord.update({
          where: { id: record.id },
          data: {
            status: 'RESIGNED',
            statusChangedAt: new Date(),
            wecomSyncStatus: 'NOT_SYNCED',
          },
        })
```

- [ ] **Step 6: 类型检查**

运行：`npx tsc --noEmit`
预期：无输出、退出码 0。

- [ ] **Step 7: 功能验证（任一状态变更后字段有值）**

浏览器打开跟进管理，对任意"沟通中"记录执行一次"预约面试"，然后查询数据库：

```bash
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{const r=await p.followUpRecord.findFirst({where:{status:'INTERVIEW_SCHEDULED'},select:{statusChangedAt:true,createdAt:true}});console.log('待面试记录 statusChangedAt:',r.statusChangedAt);await p.\$disconnect()})()"
```

预期：`statusChangedAt` 非 null 且约等于操作时刻（若刚操作完，应接近当前时间）。

- [ ] **Step 8: 提交**

```bash
git add app/api/follow-up/records/[id]/route.ts app/api/follow-up/records/route.ts app/api/follow-up/records/batch/route.ts lib/services/scheduler.ts
git commit -m "feat: 状态变更时写入 statusChangedAt 时间戳"
```

---

### Task 3: 存量数据回填脚本

**Files:**
- Create: `scripts/backfill-status-changed-at.ts`

**Interfaces:**
- Consumes: `FollowUpRecord.statusChangedAt`、`FollowUpLog.action/createdAt`、`FollowUpRecord.unsuitableAt/resignedAt/createdAt`
- Produces: 全部存量记录 `statusChangedAt` 非 null，Task 4 排序可直接上线

- [ ] **Step 1: 创建回填脚本**

完整脚本内容（与 `scripts/backfill-unsuitable-at.ts` 同模式）：

```ts
/**
 * 历史数据回填脚本：为现有跟进记录回填 statusChangedAt（进入当前状态的时间）
 *
 * 回填逻辑（从精确到粗略）：
 * 1. 最新一条状态类日志的 createdAt（CREATE / BATCH_CREATE / STATUS_CHANGE /
 *    INTERVIEW_END / UNSUITABLE / REFOLLOW / ROLLBACK）——每次状态变更都写日志，
 *    最新一条状态类日志即最后一次进入当前状态的时刻
 * 2. 无状态类日志时：UNSUITABLE 用 unsuitableAt，RESIGNED 用 resignedAt
 * 3. 再兜底用 createdAt（建档时间）
 *
 * 用法：npx tsx scripts/backfill-status-changed-at.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/** 状态类日志 action 集合：这些日志的创建时刻即一次状态变更发生的时刻 */
const STATUS_LOG_ACTIONS = [
  'CREATE',
  'BATCH_CREATE',
  'STATUS_CHANGE',
  'INTERVIEW_END',
  'UNSUITABLE',
  'REFOLLOW',
  'ROLLBACK',
]

async function main() {
  // 查找所有 statusChangedAt 为空的记录
  const records = await prisma.followUpRecord.findMany({
    where: { statusChangedAt: null },
    select: { id: true, status: true, createdAt: true, unsuitableAt: true, resignedAt: true },
  })

  console.log(`找到 ${records.length} 条待回填的跟进记录`)

  let updated = 0
  let fromLog = 0
  let fromStatusField = 0
  let fromCreatedAt = 0

  for (const record of records) {
    // 1. 最新一条状态类日志
    const latestStatusLog = await prisma.followUpLog.findFirst({
      where: { followUpRecordId: record.id, action: { in: STATUS_LOG_ACTIONS } },
      orderBy: { createdAt: 'desc' },
    })

    let statusChangedAt: Date
    if (latestStatusLog) {
      statusChangedAt = latestStatusLog.createdAt
      fromLog++
    } else if (record.status === 'UNSUITABLE' && record.unsuitableAt) {
      statusChangedAt = record.unsuitableAt
      fromStatusField++
    } else if (record.status === 'RESIGNED' && record.resignedAt) {
      statusChangedAt = record.resignedAt
      fromStatusField++
    } else {
      statusChangedAt = record.createdAt
      fromCreatedAt++
    }

    await prisma.followUpRecord.update({
      where: { id: record.id },
      data: { statusChangedAt },
    })
    updated++
  }

  console.log(`回填完成：共更新 ${updated} 条记录`)
  console.log(`  从状态类日志精确匹配: ${fromLog} 条`)
  console.log(`  从 unsuitableAt/resignedAt: ${fromStatusField} 条`)
  console.log(`  用 createdAt 兜底: ${fromCreatedAt} 条`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
```

- [ ] **Step 2: 运行回填脚本**

```bash
npx tsx scripts/backfill-status-changed-at.ts
```

预期：输出三条统计行（`从状态类日志精确匹配` 应为绝大多数；`用 createdAt 兜底` 应极少或 0）。

- [ ] **Step 3: 验证无残留 null**

```bash
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{const c=await p.followUpRecord.count({where:{statusChangedAt:null}});console.log('statusChangedAt 为 null 的记录数:',c);await p.\$disconnect()})()"
```

预期：`statusChangedAt 为 null 的记录数: 0`

- [ ] **Step 4: 提交**

```bash
git add scripts/backfill-status-changed-at.ts
git commit -m "feat: 新增 statusChangedAt 存量数据回填脚本"
```

---

### Task 4: 列表查询改为按 statusChangedAt 排序

**Files:**
- Modify: `app/api/follow-up/records/route.ts:118`

**Interfaces:**
- Consumes: 全部记录 `statusChangedAt` 非 null（Task 2 + Task 3 保证）
- Produces: `GET /api/follow-up/records` 返回结果按"进入当前状态时间"降序、二级按建档时间降序

- [ ] **Step 1: 修改排序**

旧内容（`records/route.ts` 中 `findMany` 的排序行）：

```ts
        orderBy: { createdAt: 'desc' },
```

替换为：

```ts
        orderBy: [
          { statusChangedAt: 'desc' },
          { createdAt: 'desc' },
        ],
```

- [ ] **Step 2: 类型检查**

运行：`npx tsc --noEmit`
预期：无输出、退出码 0。

- [ ] **Step 3: 接口冒烟验证**

```bash
curl -s "http://localhost:3000/api/follow-up/records?recordStatus=CONTACTING&page=1&pageSize=3" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.error||j.records.map(r=>({name:r.resume.candidateName,createdAt:r.createdAt})))})"
```

预期：返回 200 且前三名是 `createdAt` 最新建档的沟通中记录（回填后大多数沟通中记录的 statusChangedAt = 建档时间，故与旧排序基本一致，无异常报错即可）。

- [ ] **Step 4: 提交**

```bash
git add app/api/follow-up/records/route.ts
git commit -m "feat: 跟进管理列表按进入当前状态时间降序排列"
```

---

### Task 5: Playwright 端到端验证

**Files:**
- 无代码变更（验证任务）

**Interfaces:**
- Consumes: Task 1-4 全部产出

- [ ] **Step 1: 重启本地 dev 服务器**（改过 `scheduler.ts` 等服务代码，HMR 不刷新动态 import 模块）

- [ ] **Step 2: 场景一 —— 状态变更后记录上浮**

1. 打开 `/resume/follow-up`，记下"沟通中"列表**中间位置**的一条记录（如第 8 名张三）及其时间信息
2. 对其执行"预约面试"（填面试时间 → 确认），记录自动移到"待面试" tab
3. 断言：该记录出现在"待面试" tab 列表**第一位**（它刚进入待面试，statusChangedAt 最新）
4. 数据库复核：该记录 `statusChangedAt` ≈ 操作时刻

- [ ] **Step 3: 场景二 —— 回退后重新进入时间刷新**

1. 对场景一那条记录点"回退"→ 回退到"沟通中"（填回退原因）
2. 再"预约面试"一次
3. 断言：该记录仍在"待面试" tab 第一位，且 `statusChangedAt` 刷新为第二次预约时刻（而非第一次）

- [ ] **Step 4: 场景三 —— 单字段编辑不改变排序**

1. 在"待面试"tab 对第二条记录修改备注并保存
2. 断言：列表顺序不变（改备注不刷新 statusChangedAt）
3. 数据库复核：该记录 `statusChangedAt` 值未变

- [ ] **Step 5: 场景四 —— 存量数据排序合理**

1. 打开"不合适"tab，抽查前几条：进入不合适时间最新的应排最前（与"不合适时间"列展示一致）
2. 打开"已面试"tab：最新面试结束的记录应排最前

- [ ] **Step 6: 汇报结果**（含截图/数据库查询证据），无代码提交

---

## Self-Review 结论

- **规格覆盖**：操作时刻语义（Task 2 五处写入点 + Task 5 场景一二三）、统一各 tab 排序（Task 4 唯一排序入口）、回退刷新（Task 2 PATCH 块对回退同样走 statusChangedAt 刷新 + Task 5 场景二）、旧数据回填（Task 3）、二级排序（Task 4）、不展示列/不同步企微（无对应任务，符合决策）。
- **占位符扫描**：无 TBD/TODO，所有代码块为完整可粘贴内容。
- **类型一致性**：字段名 `statusChangedAt` 在 schema、5 处写入点、回填脚本、排序查询中命名一致。
