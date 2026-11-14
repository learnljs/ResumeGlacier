# 简历管道 Token 与耗时基准测试（阶段 1）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可复现的测试装置，量化同一岗位 10 份简历在「批次处理 vs 独立处理」下的 token 消耗构成（输入/输出/缓存命中/思考链）与耗时分布（API 往返 vs 本地处理），输出 Markdown 表格 + CSV 报告到 `data/logs/`。

**Architecture:** 不改数据库 schema。新增 `logAiUsage` 日志工具（console + 文件双写，单行 JSON），在 `ai-screener.ts`（screening）与 `resume-data-extractor.ts`（extraction）两个真实调用点记录 usage 明细与 API 计时。测试装置为 `scripts/token-test/` 下三个 tsx 脚本：样本选择、测试触发（HTTP 调真实 API + 直查 DB 轮询）、聚合报告。测试走真实队列与真实 AI 配置（dev server 常驻，`npm run dev` 本地运行）。

**Tech Stack:** Node 24、Next.js dev server（端口见 .env PORT，默认 3000）、Prisma（脚本直查轮询）、OpenAI SDK（DeepSeek 兼容）、tsx、原生 fetch。

## Global Constraints

- 本地 `npm run dev` 运行（**不用 docker / dev.sh**）；所有脚本命令在项目根目录用 `npx tsx` 执行
- **不改数据库 schema**：无 `prisma db push`、无 generate
- tsx 脚本不自动加载 `.env`（Next.js 的职责），脚本需显式加载（`scripts/token-test/load-env.ts`，.env → .env.local 后者覆盖，已有 process.env 不覆盖）
- 输出文件统一放 `data/logs/`（已被 .gitignore 忽略，不提交）
- 中文注释、conventional commits（`feat:` / `refactor:`）
- 测试样本只选 `parseMethod='text'` 的简历（排除 OCR 回退噪音）
- 改 `ai-screener.ts` / `resume-data-extractor.ts` 后必须**重启 dev server**（HMR 不刷新动态 import 模块）
- 测试期间避免手动触发解析/筛选操作（污染队列时序与日志窗口）
- 测试脚本执行一次 API 调用会真实消耗 Token（DeepSeek 按量计费），单次调用成本约 0.01-0.1 元

---

### Task 1: logAiUsage 日志工具

**Files:**
- Create: `lib/services/ai-usage-log.ts`

**Interfaces:**
- Produces:
  - `interface AiUsageEntry { ts: string; resumeId: string; stage: 'extraction' | 'screening'; model: string; promptTokens: number; completionTokens: number; cachedTokens: number; reasoningTokens: number; totalTokens: number; apiMs: number; localMs: number; finishReason?: string; contentLen?: number }`
  - `export function logAiUsage(entry: AiUsageEntry): void` — console 打印 `[ai-usage] {json}`，并 append 到 `data/logs/ai-usage-{YYYY-MM-DD}.log`（日期取自 `entry.ts` 前 10 字符）

- [ ] **Step 1: 创建文件**

```ts
// lib/services/ai-usage-log.ts
// AI usage 明细日志工具：console + 文件双写（单行 JSON，防并发交错）
// 供 screening / extraction 两个 AI 调用点记录 token 构成与耗时
import * as fs from 'fs'
import * as path from 'path'

export interface AiUsageEntry {
  ts: string
  resumeId: string
  stage: 'extraction' | 'screening'
  model: string
  promptTokens: number
  completionTokens: number
  cachedTokens: number
  reasoningTokens: number
  totalTokens: number
  apiMs: number
  localMs: number
  finishReason?: string
  contentLen?: number
}

export function logAiUsage(entry: AiUsageEntry): void {
  const line = JSON.stringify(entry)
  console.log(`[ai-usage] ${line}`)
  try {
    const dir = path.join(process.cwd(), 'data', 'logs')
    const file = path.join(dir, `ai-usage-${entry.ts.slice(0, 10)}.log`)
    fs.appendFileSync(file, line + '\n')
  } catch (err) {
    console.error('[ai-usage] 日志写入失败:', err instanceof Error ? err.message : err)
  }
}
```

- [ ] **Step 2: 验证写文件**

Run: `npx tsx -e "import { logAiUsage } from './lib/services/ai-usage-log'; logAiUsage({ ts: new Date().toISOString(), resumeId: 'test', stage: 'screening', model: 'test', promptTokens: 1, completionTokens: 2, cachedTokens: 0, reasoningTokens: 0, totalTokens: 3, apiMs: 10, localMs: 5 })"`
Expected: 终端出现 `[ai-usage] {"ts":"...","resumeId":"test",...}`，且 `data/logs/ai-usage-<今天日期>.log` 出现对应 JSON 行

- [ ] **Step 3: Commit**

```bash
git add lib/services/ai-usage-log.ts
git commit -m "feat: 新增 AI usage 明细日志工具（console+文件双写）"
```

---

### Task 2: screening 调用点集成日志与计时

**Files:**
- Modify: `lib/services/ai-screener.ts:1`（加 import）、`:84`（create 前计时）、`:96-116`（usage 计算后替换 console.log）

**Interfaces:**
- Consumes: `logAiUsage`、`AiUsageEntry`（Task 1）
- Produces: 无新接口；`screenResume` 行为不变，仅日志输出变化（`[screenResume]` 行替换为 `[ai-usage]` JSON 行）

- [ ] **Step 1: 加 import（文件头部 import 区）**

```ts
import { logAiUsage } from '@/lib/services/ai-usage-log'
```

- [ ] **Step 2: create 调用前加计时（`:84` 前一行）**

```ts
const apiStart = Date.now()
```

- [ ] **Step 3: 计算 apiMs/localMs 并替换 console.log（`:96-116` 区域）**

现有代码（保留 cachedTokens / reasoningTokens 计算逻辑不动）：

```ts
    const content = response.choices[0]?.message?.content || ''
    const tokenUsage = response.usage?.total_tokens || 0
    const processingTime = Date.now() - startTime
```

在其后新增：

```ts
    const apiMs = Date.now() - apiStart
    const localMs = (Date.now() - startTime) - apiMs
```

将原有 console.log 块（`[screenResume] finish_reason=...` 整块，含 usageDetail/cachedTokens/reasoningTokens 的计算与打印）替换为：

```ts
    // usage 明细拆解（DeepSeek 变体字段兼容，逻辑与替换前一致）
    const usageDetail = response.usage as unknown as {
      prompt_tokens_details?: { cached_tokens?: number }
      completion_tokens_details?: { reasoning_tokens?: number }
      input_tokens_details?: { cached_tokens?: number }
      output_tokens_details?: { reasoning_tokens?: number }
    } | undefined
    const cachedTokens =
      usageDetail?.prompt_tokens_details?.cached_tokens ??
      usageDetail?.input_tokens_details?.cached_tokens ??
      0
    const reasoningTokens =
      usageDetail?.completion_tokens_details?.reasoning_tokens ??
      usageDetail?.output_tokens_details?.reasoning_tokens ??
      0
    logAiUsage({
      ts: new Date().toISOString(),
      resumeId: resume.id,
      stage: 'screening',
      model: response.model || model,
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      cachedTokens,
      reasoningTokens,
      totalTokens: tokenUsage,
      apiMs,
      localMs,
      finishReason: response.choices[0]?.finish_reason,
      contentLen: content.length,
    })
```

注意：`processingTime` 变量仍在使用（`:207` 存入 PositionEvaluation），保留不动。

- [ ] **Step 4: 验证（lint + 代码审查）**

Run: `npm run lint` → 无新增 error

审查要点：`apiStart` 在 `client.chat.completions.create` 调用前一行；`apiMs`/`localMs` 计算在 `content` 取到之后、`logAiUsage` 调用前；`usageDetail`/`cachedTokens`/`reasoningTokens` 计算与替换前的 `:100-113` 完全一致；`processingTime` 变量仍被 `:207` 使用。

说明：运行级验证（真实 API 调用）统一在 Task 9 试跑进行（直调会真实消耗 Token，且 Task 9 的队列路径才是生产通道）。

- [ ] **Step 5: Commit**

```bash
git add lib/services/ai-screener.ts
git commit -m "refactor: screenResume 记录完整 usage 明细与 API 耗时到 ai-usage 日志"
```

---

### Task 3: extraction 调用点集成日志

**Files:**
- Modify: `lib/services/resume-data-extractor.ts:465`（options 类型加 resumeId）、`:473`（create 前计时）、`:484-495`（create 后计算与 logAiUsage）
- Modify: `lib/services/parsing-worker-processor.ts:154`（调用点传 resumeId）

**Interfaces:**
- Consumes: `logAiUsage`（Task 1）
- Produces: `extractStructuredData(resumeText, options)` 的 `options` 新增可选字段 `resumeId?: string`（向后兼容）

- [ ] **Step 1: options 类型加 resumeId**

```ts
export async function extractStructuredData(
  resumeText: string,
  options: { configId?: string; resumeId?: string; onProgress?: (progress: ItemProgress) => void } = {}
): Promise<ExtractionResult> {
```

- [ ] **Step 2: create 调用前加计时（`:473` 前一行）**

```ts
    const apiStart = Date.now()
```

- [ ] **Step 3: create 返回后记录 usage（在 `const content = response.choices[0]?.message?.content` 之前插入）**

```ts
    const apiMs = Date.now() - apiStart
    const usageDetail = response.usage as unknown as {
      prompt_tokens_details?: { cached_tokens?: number }
      completion_tokens_details?: { reasoning_tokens?: number }
      input_tokens_details?: { cached_tokens?: number }
      output_tokens_details?: { reasoning_tokens?: number }
    } | undefined
    const cachedTokens =
      usageDetail?.prompt_tokens_details?.cached_tokens ??
      usageDetail?.input_tokens_details?.cached_tokens ??
      0
    const reasoningTokens =
      usageDetail?.completion_tokens_details?.reasoning_tokens ??
      usageDetail?.output_tokens_details?.reasoning_tokens ??
      0
    logAiUsage({
      ts: new Date().toISOString(),
      resumeId: options.resumeId || '',
      stage: 'extraction',
      model: response.model || model,
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      cachedTokens,
      reasoningTokens,
      totalTokens: response.usage?.total_tokens || 0,
      apiMs,
      localMs: 0,
    })
```

文件头部加：`import { logAiUsage } from '@/lib/services/ai-usage-log'`

注意：仅主路径（`:473` 的 create）记录；`extractStructuredDataWithoutJsonMode` 降级路径不记录（异常路径，测试样本不会走到）。

- [ ] **Step 4: 调用点传 resumeId（`parsing-worker-processor.ts:154`）**

```ts
      const extractionResult = await extractStructuredData(parseResult.text, {
        resumeId: item.resumeId,
        onProgress: item.onProgress,
      })
```

- [ ] **Step 5: 验证（lint + 代码审查）**

Run: `npm run lint` → 无新增 error

审查要点：`options` 类型新增 `resumeId?: string` 为可选字段（既有调用点 `parsing-worker-processor.ts:154` 已同步传入，其他调用点不受影响）；`logAiUsage` 的 `resumeId` 取 `options.resumeId || ''`（防 undefined）；降级路径 `extractStructuredDataWithoutJsonMode` 不记录。

说明：运行级验证统一在 Task 9 试跑进行。

- [ ] **Step 6: Commit**

```bash
git add lib/services/resume-data-extractor.ts lib/services/parsing-worker-processor.ts
git commit -m "refactor: 结构化提取记录 usage 明细到 ai-usage 日志"
```

---

### Task 4: parse 路由加 autoExtract 透传后门

**背景（重要）：** `batch-parse` / `[id]/parse` 调用 `resumeParsingQueue.enqueue(ids)` 不带 options，导致 `parsing-worker-processor.ts:150` 的 `item.autoExtract` 为 false，**extraction 环节不执行**。而真实增量收取链路（邮件 fetch 端点）带 `autoExtract: true`。为让测试走完整管道（解析+提取+筛选），给两个 parse 路由加 `autoExtract?: boolean` 请求体字段透传（默认 false，**向后兼容，现有 UI 行为不变**）。

**Files:**
- Modify: `app/api/resumes/batch-parse/route.ts:8-9,36`
- Modify: `app/api/resumes/[id]/parse/route.ts`

**Interfaces:**
- Produces: `POST /api/resumes/batch-parse` body 新增可选 `autoExtract?: boolean`；`POST /api/resumes/{id}/parse` body 新增可选 `autoExtract?: boolean`

- [ ] **Step 1: batch-parse 路由透传**

`app/api/resumes/batch-parse/route.ts`：

```ts
    const { resumeIds, autoExtract } = body as { resumeIds: string[]; autoExtract?: boolean }
```

```ts
    const enqueued = await resumeParsingQueue.enqueue(resumeIds, {
      autoExtract: autoExtract === true,
    })
```

- [ ] **Step 2: [id]/parse 路由透传**

先读 `app/api/resumes/[id]/parse/route.ts` 确认现有结构，然后做同样修改：body 解析 `autoExtract`，`enqueue([resumeId], { autoExtract: autoExtract === true })`。

- [ ] **Step 3: 验证（lint + 行为审查）**

Run: `npm run lint`
Expected: 无新增 error

行为审查要点：不传 `autoExtract` 时 `autoExtract === true` 为 false → `enqueue` 不传 options 或传 `{ autoExtract: false }`，与修改前行为一致（`item.autoExtract` 为 undefined/false 均不提取）。

- [ ] **Step 4: Commit**

```bash
git add app/api/resumes/batch-parse/route.ts app/api/resumes/[id]/parse/route.ts
git commit -m "feat: parse 路由支持 autoExtract 透传（默认关闭，向后兼容）"
```

---

### Task 5: 脚本公共模块与环境加载

**Files:**
- Create: `scripts/token-test/load-env.ts`
- Create: `scripts/token-test/types.ts`

**Interfaces:**
- Produces:
  - `export function loadEnvFromFile(): void` — 手写 .env 加载（.env → .env.local 后者覆盖；`process.env` 已存在的键不覆盖）
  - `export interface SampleData { positionId: string; positionTitle: string; resumeIds: string[]; resumes: Array<{ id: string; candidateName: string | null; fileName: string; filePath: string }> }`
  - `export const LOG_DIR = 'data/logs'`
  - `export function sleep(ms: number): Promise<void>`
  - `export function getBaseUrl(): string` — `http://localhost:${process.env.PORT || '3000'}`

- [ ] **Step 1: 创建 `scripts/token-test/load-env.ts`**

```ts
// 手写 .env 加载器：tsx 直跑不经过 Next.js，需自行加载 .env
// 优先级：.env -> .env.local（后者覆盖）；已存在的 process.env 键不覆盖
import * as fs from 'fs'
import * as path from 'path'

export function loadEnvFromFile(): void {
  for (const name of ['.env', '.env.local']) {
    const file = path.join(process.cwd(), name)
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (process.env[m[1]] !== undefined) continue
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
}
```

- [ ] **Step 2: 创建 `scripts/token-test/types.ts`**

```ts
// 测试脚本共享类型与工具
export interface SampleData {
  positionId: string
  positionTitle: string
  resumeIds: string[]
  resumes: Array<{ id: string; candidateName: string | null; fileName: string; filePath: string }>
}

export const LOG_DIR = 'data/logs'

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function getBaseUrl(): string {
  return `http://localhost:${process.env.PORT || '3000'}`
}
```

- [ ] **Step 3: 验证**

Run: `npm run lint` → 无新增 error

- [ ] **Step 4: Commit**

```bash
git add scripts/token-test/load-env.ts scripts/token-test/types.ts
git commit -m "feat: 新增测试脚本公共模块（env 加载与类型）"
```

---

### Task 6: 样本选择脚本

**Files:**
- Create: `scripts/token-test/sample-select.ts`

**Interfaces:**
- Consumes: `loadEnvFromFile`、`SampleData`、`LOG_DIR`、`sleep`（Task 5）
- Produces: `data/logs/token-test-sample.json`（SampleData 结构）

**选择规则（已确认决策）：** 同一岗位、`parseMethod='text'`、附件文件存在（`fs.existsSync(filePath)`）的简历，取数量最多的岗位的 10 份（按 createdAt 升序）。

- [ ] **Step 1: 创建脚本**

```ts
// 样本选择：同一岗位 parseMethod=text 且附件文件存在的简历，取 10 份
// 输出 data/logs/token-test-sample.json
import { loadEnvFromFile } from './load-env'
import { LOG_DIR, type SampleData } from './types'
import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

loadEnvFromFile()
const prisma = new PrismaClient()
const SAMPLE_SIZE = 10

async function main(): Promise<void> {
  // 按岗位统计 parseMethod=text 的简历数
  const groups = await prisma.resume.groupBy({
    by: ['positionId'],
    where: { parseMethod: 'text', extractedText: { not: null } },
    _count: { _all: true },
  })
  const candidates = groups
    .filter((g) => g.positionId && g._count._all >= SAMPLE_SIZE)
    .sort((a, b) => b._count._all - a._count._all)

  if (candidates.length === 0) {
    console.error(`没有 parseMethod=text 且数量 >= ${SAMPLE_SIZE} 的岗位。各岗位数量：`)
    for (const g of groups.sort((a, b) => b._count._all - a._count._all)) {
      console.error(`  positionId=${g.positionId} count=${g._count._all}`)
    }
    process.exit(1)
  }

  const positionId = candidates[0].positionId!
  const resumes = await prisma.resume.findMany({
    where: { positionId, parseMethod: 'text' },
    select: { id: true, candidateName: true, fileName: true, filePath: true },
    orderBy: { createdAt: 'asc' },
    take: SAMPLE_SIZE,
  })

  // 附件文件存在性检查（重解析需要读原始文件）
  const existing = resumes.filter((r) => fs.existsSync(r.filePath))
  if (existing.length < SAMPLE_SIZE) {
    console.error(
      `附件文件缺失：${existing.length}/${SAMPLE_SIZE}（如 data/uploads 被清理，需先恢复）`
    )
    process.exit(1)
  }

  const position = await prisma.position.findUnique({ where: { id: positionId } })
  const sample: SampleData = {
    positionId,
    positionTitle: position?.title || '(未知)',
    resumeIds: existing.map((r) => r.id),
    resumes: existing,
  }

  const outFile = path.join(LOG_DIR, 'token-test-sample.json')
  fs.writeFileSync(outFile, JSON.stringify(sample, null, 2))
  console.log(`样本已写入 ${outFile}`)
  console.log(`岗位: ${sample.positionTitle}（${positionId}），${sample.resumeIds.length} 份`)
  for (const r of existing) {
    console.log(`  ${r.id}  ${r.candidateName || '(无姓名)'}  ${r.fileName}`)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: 运行验证**

Run: `npx tsx scripts/token-test/sample-select.ts`
Expected: 输出岗位与 10 份简历清单，`data/logs/token-test-sample.json` 生成且 `resumeIds` 长度 = 10

- [ ] **Step 3: Commit**

```bash
git add scripts/token-test/sample-select.ts
git commit -m "feat: 新增 token 测试样本选择脚本"
```

---

### Task 7: 测试触发脚本

**Files:**
- Create: `scripts/token-test/run-token-test.ts`

**Interfaces:**
- Consumes: `loadEnvFromFile`、`SampleData`、`getBaseUrl`、`sleep`、`LOG_DIR`（Task 5）；`generateReport`（Task 8，最后实现，本任务先留调用点）
- Produces: 无独立产物（触发处理，由 ai-usage 日志 + Task 8 报告承载结果）

**命令行参数（手动解析 `process.argv`，格式 `--key=value`）：**
- `--mode=batch|independent`（必填）
- `--round=1|2`（必填，写入报告命名）
- `--sample=data/logs/token-test-sample.json`（默认该路径）
- `--limit=N`（可选，试跑用：只处理前 N 份）

**流程（已确认决策）：**
- batch：`POST /api/resumes/batch-parse`（body `{ resumeIds, autoExtract: true }`）→ 轮询全部离开 `PARSING` → `POST /api/resumes/batch-screen`（body `{ ids: resumeIds }`）→ 轮询全部进入 `SCREENED`/`ERROR`
- independent：对每份依次 `POST /api/resumes/{id}/parse`（body `{ autoExtract: true }`）→ 轮询该份离开 `PARSING` → `POST /api/resumes/{id}/screen`（body `{ positionId }`）→ 轮询该份进入 `SCREENED`/`ERROR` → 下一份
- 每轮记录 startTs/endTs（ISO 字符串），结束时调用 `generateReport`（Task 8）

- [ ] **Step 1: 创建脚本**

```ts
// token 测试触发脚本：批次/独立两种模式，走真实 API 与真实队列
// 用法：
//   npx tsx scripts/token-test/run-token-test.ts --mode=batch --round=1
//   npx tsx scripts/token-test/run-token-test.ts --mode=independent --round=2 --limit=2
import { loadEnvFromFile } from './load-env'
import { getBaseUrl, sleep, type SampleData } from './types'
import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

loadEnvFromFile()
const prisma = new PrismaClient()

const POLL_INTERVAL_MS = 3000
const PARSE_TIMEOUT_MS = 15 * 60 * 1000
const SCREEN_TIMEOUT_MS = 30 * 60 * 1000

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {}
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/)
    if (m) args[m[1]] = m[2]
  }
  return args
}

async function post(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`API ${url} 失败 ${res.status}: ${JSON.stringify(data)}`)
  return data as Record<string, unknown>
}

/** 轮询直到全部 resume 进入 doneStatuses，返回 { id: status } */
async function waitForStatuses(
  resumeIds: string[],
  doneStatuses: string[],
  timeoutMs: number,
  label: string
): Promise<Record<string, string>> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const rows = await prisma.resume.findMany({
      where: { id: { in: resumeIds } },
      select: { id: true, status: true, errorMessage: true },
    })
    const statusMap = Object.fromEntries(rows.map((r) => [r.id, r.status]))
    if (resumeIds.every((id) => doneStatuses.includes(statusMap[id] || ''))) {
      return statusMap
    }
    // 提前退出：出现非预期 ERROR（解析阶段 PARSING 外的 ERROR 或筛选阶段 ERROR 视为失败）
    const errored = rows.filter((r) => r.status === 'ERROR')
    if (errored.length > 0) {
      console.error(`[${label}] ERROR 简历:`)
      for (const e of errored) console.error(`  ${e.id}: ${e.errorMessage}`)
      throw new Error(`${label} 出现 ${errored.length} 份 ERROR`)
    }
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(`${label} 超时（${timeoutMs / 1000}s）`)
}

async function runBatch(sample: SampleData): Promise<void> {
  const base = getBaseUrl()
  console.log(`[batch] 解析 ${sample.resumeIds.length} 份（autoExtract）...`)
  await post(`${base}/api/resumes/batch-parse`, {
    resumeIds: sample.resumeIds,
    autoExtract: true,
  })
  await waitForStatuses(sample.resumeIds, ['PENDING', 'SCREENED', 'UNASSIGNED'], PARSE_TIMEOUT_MS, 'batch-parse')
  console.log('[batch] 解析完成，开始筛选...')
  await post(`${base}/api/resumes/batch-screen`, { ids: sample.resumeIds })
  await waitForStatuses(sample.resumeIds, ['SCREENED'], SCREEN_TIMEOUT_MS, 'batch-screen')
  console.log('[batch] 筛选完成')
}

async function runIndependent(sample: SampleData): Promise<void> {
  const base = getBaseUrl()
  for (const r of sample.resumes) {
    console.log(`[independent] 处理 ${r.id} ${r.candidateName || ''}...`)
    await post(`${base}/api/resumes/${r.id}/parse`, { autoExtract: true })
    await waitForStatuses([r.id], ['PENDING', 'SCREENED', 'UNASSIGNED'], PARSE_TIMEOUT_MS, `parse-${r.id}`)
    await post(`${base}/api/resumes/${r.id}/screen`, { positionId: sample.positionId })
    await waitForStatuses([r.id], ['SCREENED'], SCREEN_TIMEOUT_MS, `screen-${r.id}`)
    console.log(`[independent] ${r.id} 完成`)
  }
}

async function main(): Promise<void> {
  const args = parseArgs()
  const mode = args.mode as 'batch' | 'independent' | undefined
  const round = Number(args.round)
  const samplePath = args.sample || path.join('data', 'logs', 'token-test-sample.json')
  const limit = args.limit ? Number(args.limit) : undefined
  if (!mode || !['batch', 'independent'].includes(mode)) throw new Error('--mode=batch|independent 必填')
  if (!Number.isInteger(round) || round < 1) throw new Error('--round=N 必填')
  if (!fs.existsSync(samplePath)) throw new Error(`样本文件不存在: ${samplePath}`)
  const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8')) as SampleData
  if (limit) {
    sample.resumes = sample.resumes.slice(0, limit)
    sample.resumeIds = sample.resumes.map((r) => r.id)
  }

  console.log(`=== 模式=${mode} 轮次=${round} 简历数=${sample.resumeIds.length} 岗位=${sample.positionTitle} ===`)
  const startTs = new Date()

  if (mode === 'batch') {
    await runBatch(sample)
  } else {
    await runIndependent(sample)
  }

  const endTs = new Date()
  console.log(`总耗时: ${(endTs.getTime() - startTs.getTime()) / 1000}s`)

  // 生成报告（Task 8 实现后生效）
  const { generateReport } = await import('./aggregate')
  await generateReport({ mode, round, samplePath, startTs, endTs })

  // 等待 dev server 完成剩余队列任务（筛选队列 worker 处理完会有 500ms 间隔尾巴）
  await sleep(5000)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: 验证（lint + 结构检查）**

Run: `npm run lint` → 无新增 error
说明：本任务依赖 Task 8 的 `generateReport`，联调验证在 Task 9（试跑）进行。

- [ ] **Step 3: Commit**

```bash
git add scripts/token-test/run-token-test.ts
git commit -m "feat: 新增 token 测试触发脚本（批次/独立两模式）"
```

---

### Task 8: 聚合报告脚本

**Files:**
- Create: `scripts/token-test/aggregate.ts`

**Interfaces:**
- Consumes: `SampleData`、`sleep`、`LOG_DIR`（Task 5）
- Produces:
  - `export async function generateReport(params: { mode: string; round: number; samplePath: string; startTs: Date; endTs: Date }): Promise<void>`
  - `data/logs/token-test-{mode}-r{round}.md`（明细表 + 汇总表）
  - `data/logs/token-test-{mode}-r{round}.csv`（原始明细）
  - CLI：`npx tsx scripts/token-test/aggregate.ts --mode=batch --round=1 --sample=... --start=ISO --end=ISO` 独立运行

**聚合逻辑：**
- 日志文件：`data/logs/ai-usage-{YYYY-MM-DD}.log`（日期取 startTs 本地日期）
- 过滤：`JSON.parse` 成功、`resumeId` ∈ 样本 resumeIds、`ts` ∈ [startTs, endTs] 窗口
- 分组：按 (resumeId, stage)；每份应恰有 extraction + screening 两行，缺失则报告警告并计入"缺失检测"
- 汇总指标：总输入（promptTokens 和）、总输出（completionTokens 和）、总 token、缓存命中率（cachedTokens / promptTokens）、平均 apiMs、平均 localMs、总耗时（endTs - startTs）

- [ ] **Step 1: 创建脚本**

```ts
// 聚合 ai-usage 日志为 Markdown 表格 + CSV 报告
// 用法（独立运行）：
//   npx tsx scripts/token-test/aggregate.ts --mode=batch --round=1 --sample=data/logs/token-test-sample.json --start=2026-08-10T09:00:00.000Z --end=2026-08-10T09:30:00.000Z
import { LOG_DIR, type SampleData } from './types'
import * as fs from 'fs'
import * as path from 'path'

interface UsageRow {
  ts: string
  resumeId: string
  stage: 'extraction' | 'screening'
  model: string
  promptTokens: number
  completionTokens: number
  cachedTokens: number
  reasoningTokens: number
  totalTokens: number
  apiMs: number
  localMs: number
  finishReason?: string
  contentLen?: number
}

interface ReportParams {
  mode: string
  round: number
  samplePath: string
  startTs: Date
  endTs: Date
}

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {}
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/)
    if (m) args[m[1]] = m[2]
  }
  return args
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 读取日志文件并过滤出窗口内的样本行 */
function loadRows(sample: SampleData, startTs: Date, endTs: Date): UsageRow[] {
  const file = path.join(LOG_DIR, `ai-usage-${localDateStr(startTs)}.log`)
  if (!fs.existsSync(file)) throw new Error(`日志文件不存在: ${file}`)
  const idSet = new Set(sample.resumeIds)
  const startMs = startTs.getTime()
  const endMs = endTs.getTime()
  const rows: UsageRow[] = []
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let row: UsageRow
    try {
      row = JSON.parse(line) as UsageRow
    } catch {
      continue // 非 JSON 行（其他日志），跳过
    }
    const t = new Date(row.ts).getTime()
    if (!idSet.has(row.resumeId)) continue
    if (t < startMs || t > endMs) continue
    rows.push(row)
  }
  return rows
}

/** 输出 Markdown 报告 */
function writeMarkdown(params: ReportParams, sample: SampleData, rows: UsageRow[], totalMs: number): void {
  const byId = new Map<string, UsageRow[]>()
  for (const r of rows) {
    const list = byId.get(r.resumeId) || []
    list.push(r)
    byId.set(r.resumeId, list)
  }

  // 缺失检测
  const missing: string[] = []
  for (const id of sample.resumeIds) {
    const list = byId.get(id) || []
    if (!list.some((r) => r.stage === 'extraction')) missing.push(`${id} extraction`)
    if (!list.some((r) => r.stage === 'screening')) missing.push(`${id} screening`)
  }

  const lines: string[] = []
  lines.push(`# Token 测试报告：${params.mode} 模式 第 ${params.round} 轮`)
  lines.push('')
  lines.push(`- 岗位：${sample.positionTitle}（${sample.positionId}）`)
  lines.push(`- 简历数：${sample.resumeIds.length}`)
  lines.push(`- 时间窗口：${params.startTs.toISOString()} ~ ${params.endTs.toISOString()}`)
  lines.push(`- 总耗时：${(totalMs / 1000).toFixed(1)}s`)
  if (missing.length > 0) {
    lines.push(`- ⚠️ 缺失日志（${missing.length}）：${missing.join('、')}`)
  }
  lines.push('')
  lines.push('## 明细')
  lines.push('')
  lines.push('| resumeId | 环节 | 输入token | 其中缓存命中 | 未命中 | 输出token | 其中思考链 | 总计 | API往返ms | 本地处理ms |')
  lines.push('|----------|------|-----------|-------------|--------|-----------|-----------|------|-----------|------------|')
  for (const id of sample.resumeIds) {
    for (const stage of ['extraction', 'screening'] as const) {
      const row = (byId.get(id) || []).find((r) => r.stage === stage)
      if (!row) {
        lines.push(`| ${id} | ${stage} | 缺失 | - | - | - | - | - | - | - |`)
        continue
      }
      lines.push(
        `| ${id} | ${stage} | ${row.promptTokens} | ${row.cachedTokens} | ${row.promptTokens - row.cachedTokens} | ${row.completionTokens} | ${row.reasoningTokens} | ${row.totalTokens} | ${row.apiMs} | ${row.localMs} |`
      )
    }
  }
  lines.push('')
  lines.push('## 汇总')
  lines.push('')
  lines.push('| 指标 | extraction | screening | 合计 |')
  lines.push('|------|-----------|-----------|------|')
  const sum = (stage: string, field: (r: UsageRow) => number): number =>
    rows.filter((r) => r.stage === stage).reduce((acc, r) => acc + field(r), 0)
  const all = rows
  const avg = (stage: string, field: (r: UsageRow) => number): string => {
    const list = rows.filter((r) => r.stage === stage)
    return list.length ? (list.reduce((a, r) => a + field(r), 0) / list.length).toFixed(0) : '0'
  }
  const promptTotal = sum('', (r) => r.promptTokens)
  lines.push(`| 总输入 token | ${sum('extraction', (r) => r.promptTokens)} | ${sum('screening', (r) => r.promptTokens)} | ${promptTotal} |`)
  lines.push(`| 总输出 token | ${sum('extraction', (r) => r.completionTokens)} | ${sum('screening', (r) => r.completionTokens)} | ${sum('', (r) => r.completionTokens)} |`)
  lines.push(`| 总 token | ${sum('extraction', (r) => r.totalTokens)} | ${sum('screening', (r) => r.totalTokens)} | ${sum('', (r) => r.totalTokens)} |`)
  const hitRate = (stage: string): string => {
    const list = rows.filter((r) => r.stage === stage)
    const p = list.reduce((a, r) => a + r.promptTokens, 0)
    const c = list.reduce((a, r) => a + r.cachedTokens, 0)
    return p > 0 ? `${((c / p) * 100).toFixed(1)}%` : '-'
  }
  lines.push(`| 缓存命中率 | ${hitRate('extraction')} | ${hitRate('screening')} | ${all.length ? ((all.reduce((a, r) => a + r.cachedTokens, 0) / all.reduce((a, r) => a + r.promptTokens, 0)) * 100).toFixed(1) + '%' : '-'} |`)
  lines.push(`| 平均 API 往返 ms | ${avg('extraction', (r) => r.apiMs)} | ${avg('screening', (r) => r.apiMs)} | - |`)
  lines.push(`| 平均本地处理 ms | ${avg('extraction', (r) => r.localMs)} | ${avg('screening', (r) => r.localMs)} | - |`)
  lines.push(`| 平均单份总 token | ${(sum('extraction', (r) => r.totalTokens) / sample.resumeIds.length).toFixed(0)} | ${(sum('screening', (r) => r.totalTokens) / sample.resumeIds.length).toFixed(0)} | ${(sum('', (r) => r.totalTokens) / sample.resumeIds.length).toFixed(0)} |`)
  lines.push('')
  lines.push('## 原始数据')
  lines.push('')
  lines.push(`CSV：\`data/logs/token-test-${params.mode}-r${params.round}.csv\``)

  fs.writeFileSync(
    path.join(LOG_DIR, `token-test-${params.mode}-r${params.round}.md`),
    lines.join('\n') + '\n'
  )
}

/** 输出 CSV */
function writeCsv(params: ReportParams, rows: UsageRow[]): void {
  const header = 'ts,resumeId,stage,model,promptTokens,cachedTokens,uncachedTokens,completionTokens,reasoningTokens,totalTokens,apiMs,localMs,finishReason,contentLen'
  const body = rows
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .map((r) =>
      [r.ts, r.resumeId, r.stage, r.model, r.promptTokens, r.cachedTokens, r.promptTokens - r.cachedTokens, r.completionTokens, r.reasoningTokens, r.totalTokens, r.apiMs, r.localMs, r.finishReason || '', r.contentLen ?? ''].join(',')
    )
  fs.writeFileSync(
    path.join(LOG_DIR, `token-test-${params.mode}-r${params.round}.csv`),
    [header, ...body].join('\n') + '\n'
  )
}

export async function generateReport(params: ReportParams): Promise<void> {
  const sample = JSON.parse(fs.readFileSync(params.samplePath, 'utf8')) as SampleData
  const rows = loadRows(sample, params.startTs, params.endTs)
  const totalMs = params.endTs.getTime() - params.startTs.getTime()
  writeMarkdown(params, sample, rows, totalMs)
  writeCsv(params, rows)
  console.log(
    `报告已生成: data/logs/token-test-${params.mode}-r${params.round}.md / .csv（${rows.length} 行日志）`
  )
}

// CLI 入口（独立运行）
if (process.argv[1]?.endsWith('aggregate.ts')) {
  const args = parseArgs()
  const mode = args.mode
  const round = Number(args.round)
  const samplePath = args.sample
  const startTs = new Date(args.start)
  const endTs = new Date(args.end)
  if (!mode || !round || !samplePath || !args.start || !args.end) {
    console.error('用法: --mode=batch|independent --round=N --sample=路径 --start=ISO --end=ISO')
    process.exit(1)
  }
  generateReport({ mode, round, samplePath, startTs, endTs })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
```

- [ ] **Step 2: 验证（用 Task 2/3 验证时产生的真实日志行）**

Run:
```bash
npx tsx scripts/token-test/aggregate.ts --mode=test --round=0 --sample=data/logs/token-test-sample.json --start=2026-08-10T00:00:00.000Z --end=2099-01-01T00:00:00.000Z
```
说明：`--end` 用远期时间覆盖 Task 2/3 产生的日志行（若样本 resumeIds 不含那些行，会输出"0 行"与缺失警告——此时先确认样本 json 的 resumeIds 与验证简历不一致属正常，再手动把样本 json 临时改为包含验证简历 id 复测，或直接跳到 Task 9 联调验证）。
Expected: `data/logs/token-test-test-r0.md/.csv` 生成，格式符合上述模板；若窗口内有行则表格有数据。

- [ ] **Step 3: Commit**

```bash
git add scripts/token-test/aggregate.ts
git commit -m "feat: 新增 token 测试聚合报告脚本（Markdown+CSV）"
```

---

### Task 9: 重启 dev server 与 2 份试跑

**Files:** 无代码改动

- [ ] **Step 1: 重启 dev server**

通知用户：停止当前 `npm run dev`（Ctrl+C），重新 `npm run dev` 启动（ai-screener / resume-data-extractor 已改动，HMR 不刷新动态 import 模块，必须重启）。

- [ ] **Step 2: 试跑 batch 模式 2 份**

Run: `npx tsx scripts/token-test/run-token-test.ts --mode=batch --round=0 --limit=2`
Expected:
- 终端依次出现 batch-parse / batch-screen 完成日志
- `data/logs/ai-usage-<今天>.log` 新增 4 行（2 份 × extraction + screening），screening 行带 `finishReason`/`contentLen`
- `data/logs/token-test-batch-r0.md/.csv` 生成，明细表 4 行、无"缺失"警告、汇总行数字非零

- [ ] **Step 3: 核对缓存字段**

Run: `cat data/logs/ai-usage-<今天>.log | tail -8`
Expected: 第一份 screening 行 cachedTokens 可能为 0（冷启动），第二份 screening 行 cachedTokens > 0（同岗位 system prompt 缓存命中）——**若两份都命中或都未命中，记录现象并在阶段 2 讨论**（这正是测试要回答的问题）。

- [ ] **Step 4: 试跑 independent 模式 2 份**

Run: `npx tsx scripts/token-test/run-token-test.ts --mode=independent --round=0 --limit=2`
Expected: 与 Step 2 类似，报告 `token-test-independent-r0.md/.csv` 生成。

- [ ] **Step 5: Commit（如有试跑期间的脚本修正）**

```bash
git add scripts/token-test/ data/logs 2>/dev/null; git commit -m "fix: 试跑修正" 2>/dev/null || true
```
说明：data/logs 已被 gitignore，只提交脚本修正；若无修正则跳过本步。

---

### Task 10: 正式 4 轮测试

**Files:** 无代码改动（执行性任务）

- [ ] **Step 1: 确认前置条件**

- dev server 已运行（Task 9 重启后的实例）
- 测试期间不手动触发任何解析/筛选
- `data/logs/token-test-sample.json` 存在且 resumeIds 长度 = 10

- [ ] **Step 2: 顺序执行 4 轮**

```bash
npx tsx scripts/token-test/run-token-test.ts --mode=batch --round=1
npx tsx scripts/token-test/run-token-test.ts --mode=batch --round=2
npx tsx scripts/token-test/run-token-test.ts --mode=independent --round=1
npx tsx scripts/token-test/run-token-test.ts --mode=independent --round=2
```

每轮预计耗时：batch 约 10-25 分钟（解析并发 1 + 筛选并发 2），independent 约 20-50 分钟（串行）。4 轮总计约 1-2.5 小时。单轮内如出现 ERROR 简历，脚本会中止并打印 errorMessage——报告给用户后决定重跑或继续。

- [ ] **Step 3: 生成对比汇总（手工计算，输出 `data/logs/token-test-compare.md`）**

由执行者取 4 份 md 的汇总表，计算并写入 `data/logs/token-test-compare.md`：
- 总输入 token：batch（两轮平均）vs independent（两轮平均），差异百分比 = (batch - independent) / independent × 100
- 总输出 token：同上
- 缓存命中率：batch vs independent（extraction / screening 两环节分别对比）
- 平均单份耗时：batch vs independent，差异百分比
- 各环节占比：extraction / screening 在总 token 中的占比

- [ ] **Step 4: 交付阶段 1 报告**

向用户呈现：4 份 md + 4 份 csv + 1 份对比汇总，并给出初步解读（缓存命中率、批次 vs 独立差异、API 往返占比、瓶颈指向），进入阶段 2 讨论。

---

## Self-Review（计划自审）

**1. Spec coverage（对照用户三维度需求）:**
- 维度 1 Token 消耗：单份输入/输出 token ✅（Task 2/3 日志含 prompt/completion）、缓存命中率 ✅（cachedTokens）、10 份独立 vs 批次总输入/输出 ✅（Task 10）、差异百分比 ✅（compare）
- 维度 2 时间效率：总耗时/平均单份 ✅（Task 8 汇总）、批次 vs 独立耗时对比 ✅、瓶颈识别 ✅（apiMs vs localMs 拆分；网络 vs 模型细分为可选增强，计划外说明）
- 维度 3 容量：**不在本计划**（已确认挪到阶段 3，优化后测试）

**2. Placeholder scan:** 无 TODO/TBD；每步含实际代码或明确命令。Task 8 Step 2 的验证依赖窗口数据，已说明处理方式。

**3. Type consistency:** `AiUsageEntry`（Task 1）字段在 Task 2/3 填写一致；`SampleData`（Task 5）在 Task 6/7/8 使用一致；`generateReport` 签名（Task 8 定义）与 Task 7 调用一致；Task 2/3 的验证已改为 lint + 审查（运行级验证统一在 Task 9），不再存在对 Task 5 模块的前置引用。

**已知风险与说明:**
- 阶段 2/3 不在本计划内，仅 Task 10 收尾交付。
- 网络 vs 模型耗时细拆分需要 DeepSeek 响应头实测，列为可选增强（阶段 2 讨论时决定是否需要）。
- 若 DB 中同岗位 parseMethod=text 简历不足 10 份，Task 6 会列出各岗位数量并退出——届时需要用户人工决策（扩充样本或换岗位）。
- Task 7 中 batch-screen 会为每轮创建 `TaskBatch`（source='rescreen'）记录，属正常业务行为，测试后可在 UI 任务管理查看。
