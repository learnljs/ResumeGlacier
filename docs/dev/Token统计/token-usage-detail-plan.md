# 评估 token 明细展示 + 删除 localMs 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PositionEvaluation 存储 token 明细（输入/输出/缓存命中/思考链），简历详情页悬停 Tokens 展示构成；`[ai-usage]` 日志与 aggregate 脚本删除 localMs。

**Architecture:** 数据层加 4 个 Int? 列（sqlite db push 加列可行）；ai-screener 保存时一并写入（数据已算好，无新逻辑）；前端用现有 shadcn Tooltip 包裹头部 Tokens 展示。未命中 = 输入 − 缓存，前端推导不存储。

**Tech Stack:** Next.js / Prisma / SQLite / shadcn Tooltip / TypeScript

**设计文档:** `doc/dev/token-usage-detail.md`

## Global Constraints

- 项目**无自动化单元测试**，验证靠 `npm run lint` + Playwright MCP 端到端（测试文件放 `.playwright-mcp/`）
- 所有 Node 工具链命令通过 `./dev.sh` 执行（`./dev.sh npx prisma db push`、`./dev.sh npm run lint`）
- Prisma 无迁移，schema 变更后 `prisma db push` + `prisma generate`
- 代码注释、commit message 用中文
- 外科手术式修改：不动范围外代码（`app/api/prompts/preview/route.ts`、extraction 的 DB 存储均不改）
- 改 `ai-screener.ts` 后必须重启服务（动态 import 模块，HMR 不刷新）
- 全部任务完成后**统一一条 commit**（用户要求），push 由用户完成

---

### Task 1: Schema 加 4 字段 + ai-screener 保存明细

**Files:**
- Modify: `prisma/schema.prisma`（PositionEvaluation，约 174 行 `tokenUsage` 旁）
- Modify: `lib/services/ai-screener.ts:214-225`（evaluationData）

**Interfaces:**
- Produces: `PositionEvaluation.promptTokens/completionTokens/cachedTokens/reasoningTokens`（Int?，供 Task 3 前端使用）

- [ ] **Step 1: Schema 加字段**

在 `prisma/schema.prisma` PositionEvaluation 的 `tokenUsage Int?` 与 `processingTime Int?` 之间插入：

```prisma
  tokenUsage       Int?                         // Token 消耗
  promptTokens     Int?                         // 输入 token
  completionTokens Int?                         // 输出 token
  cachedTokens     Int?                         // 输入中缓存命中
  reasoningTokens  Int?                         // 输出中思考链
  processingTime   Int?                         // 处理耗时(ms)
```

- [ ] **Step 2: ai-screener 保存明细**

`lib/services/ai-screener.ts` 的 `evaluationData`（约 214 行）在 `tokenUsage,` 后加 4 行（`cachedTokens`/`reasoningTokens` 变量在本函数 110-117 行已算好，`response.usage` 此处可用）：

```ts
      tokenUsage,
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      cachedTokens,
      reasoningTokens,
```

- [ ] **Step 3: 推送 schema**

```bash
./dev.sh npx prisma db push
./dev.sh npx prisma generate
```

Expected: 两条命令均成功，输出显示新增 4 列。

- [ ] **Step 4: 验证（静态）**

```bash
./dev.sh npm run lint
```

Expected: 无新增错误。运行时不验证（依赖 Task 4 端到端）。

---

### Task 2: 删除 localMs（日志 3 处 + aggregate 脚本）

**Files:**
- Modify: `lib/services/ai-usage-log.ts:7-21`（AiUsageEntry 接口）
- Modify: `lib/services/ai-screener.ts:102,129`（变量定义与日志调用）
- Modify: `lib/services/resume-data-extractor.ts:513`（日志调用）
- Modify: `scripts/token-test/aggregate.ts`（第 19、104、114、153、168、172 行）

**Interfaces:**
- Consumes: Task 1 已改动的 ai-screener.ts
- Produces: `[ai-usage]` 日志不再含 localMs 字段；aggregate 报告无"本地处理ms"列

- [ ] **Step 1: 接口删字段**

`lib/services/ai-usage-log.ts` 的 `AiUsageEntry` 删除 `localMs: number` 行。

- [ ] **Step 2: ai-screener 删两处**

`lib/services/ai-screener.ts`：
- 删除 102 行 `const localMs = (Date.now() - startTime) - apiMs`（不再被引用，否则 lint 报未使用）
- 删除 logAiUsage 调用中 `localMs,` 行（约 129 行）

- [ ] **Step 3: resume-data-extractor 删一处**

`lib/services/resume-data-extractor.ts` logAiUsage 调用中删除 `localMs: 0,` 行（约 513 行）。

- [ ] **Step 4: aggregate 脚本删干净**

`scripts/token-test/aggregate.ts` 共 4 处：
1. `UsageRow` 接口删 `localMs: number`（约 19 行）
2. Markdown 明细表头删 `| 本地处理ms |`、对应单元格删 `| ${row.localMs} |`（约 104、114 行）
3. 汇总删 `| 平均本地处理 ms | ...` 行（约 153 行）
4. CSV header 与 body 删 `localMs` 及 `r.localMs`（约 168、172 行）

- [ ] **Step 5: 静态验证**

```bash
./dev.sh npm run lint
grep -n "localMs" lib/services/ai-screener.ts lib/services/ai-usage-log.ts lib/services/resume-data-extractor.ts scripts/token-test/aggregate.ts
```

Expected: lint 通过；grep 无任何输出（全部删除干净）。

---

### Task 3: 详情页 Tooltip 展示 token 明细

**Files:**
- Modify: `app/resume/detail/[id]/page.tsx`（类型约 75 行；渲染约 560-562 行）

**Interfaces:**
- Consumes: Task 1 新增的 4 个字段（API 全字段返回，无需改 route）

- [ ] **Step 1: 类型加字段**

`app/resume/detail/[id]/page.tsx` evaluations 数组项类型（约 74-76 行）`tokenUsage: number | null` 后加：

```ts
    promptTokens: number | null
    completionTokens: number | null
    cachedTokens: number | null
    reasoningTokens: number | null
```

- [ ] **Step 2: 导入 Tooltip 组件**

文件顶部现有 shadcn 导入处追加：

```ts
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
```

（若文件已 import 过 Tooltip 则跳过。）

- [ ] **Step 3: 替换头部 Tokens 渲染**

原代码（约 560-562 行）：

```tsx
            {result?.tokenUsage && (
              <span>Tokens: {result.tokenUsage}</span>
            )}
```

替换为：

```tsx
            {result?.tokenUsage && (
              result.promptTokens != null ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help border-b border-dotted border-muted-foreground/50">
                        Tokens: {result.tokenUsage}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      <div className="grid grid-cols-2 gap-x-5 gap-y-1">
                        <span>输入 {result.promptTokens}</span>
                        <span>缓存命中 {result.cachedTokens}</span>
                        <span>输出 {result.completionTokens}</span>
                        <span>未命中 {result.promptTokens - (result.cachedTokens ?? 0)}</span>
                        <span>思考 {result.reasoningTokens}</span>
                        <span>总计 {result.tokenUsage}</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <span>Tokens: {result.tokenUsage}</span>
              )
            )}
```

要点：老记录 `promptTokens` 为 null → 走 else 分支，只显示总数、无悬停；新记录悬停弹出两列六行明细。

- [ ] **Step 4: 静态验证**

```bash
./dev.sh npm run lint
./dev.sh npm run build
```

Expected: lint 与 build 均通过（build 可先于端到端确认类型无误）。

---

### Task 4: 端到端验证（Playwright MCP）

**Files:**
- Create: `.playwright-mcp/token-detail-tooltip.md`（操作记录，项目惯例）

**Interfaces:**
- Consumes: 全部三个 Task 的产物；需服务重启后生效

- [ ] **Step 1: 询问用户后重启服务**

按项目惯例先询问用户是否由我启动/重启 Docker 与 Playwright（用户确认后执行 `./dev.sh stop && ./dev.sh start`，改过 ai-screener 必须重启）。

- [ ] **Step 2: 验证点 1 —— 悬停明细**

打开一张**最近重新评估过**的简历详情页，悬停头部 `Tokens: 8333`（带虚线下划线处）：
Expected: 弹出明细（输入/输出/思考/缓存命中/未命中/总计），数值与该简历 `data/logs/ai-usage-*.log` 中 `resumeId` 对应的最近一条 screening 记录一致（prompt=输入、completion=输出、reasoning=思考、cached=缓存命中、prompt−cached=未命中）。

- [ ] **Step 3: 验证点 2 —— 日志无 localMs**

```bash
grep -n "localMs" data/logs/ai-usage-*.log
```

Expected: 无输出（新日志行已无该字段；旧日志若存在 localMs 行属历史数据，不处理）。

- [ ] **Step 4: 验证点 3 —— 重新评估落库**

触发一次重新评估（详情页或任务批次页），完成后刷新详情页：
Expected: 悬停明细数值随新评估更新；确认新字段已写入（数值与日志一致）。

- [ ] **Step 5: 验证点 4 —— 老记录兼容**

打开一条**评估后未再重新评估**的简历（数据库里 evaluations.promptTokens 为 NULL）：
Expected: 只显示 `Tokens: 总数`，无虚线下划线、悬停无弹出，页面无报错。

- [ ] **Step 6: 收尾提醒**

按惯例提醒用户查看 `.playwright-mcp/` 测试记录并询问是否清理。

---

### Task 5: 统一 commit（用户要求一条）

- [ ] **Step 1: 检查状态**

```bash
git status --short
```

Expected: 改动文件 = prisma/schema.prisma、lib/services/ai-screener.ts、lib/services/ai-usage-log.ts、lib/services/resume-data-extractor.ts、scripts/token-test/aggregate.ts、app/resume/detail/[id]/page.tsx（`.playwright-mcp/` 与设计文档已单独处理，不包含）。

- [ ] **Step 2: 统一提交**

```bash
git add prisma/schema.prisma lib/services/ai-screener.ts lib/services/ai-usage-log.ts lib/services/resume-data-extractor.ts scripts/token-test/aggregate.ts "app/resume/detail/[id]/page.tsx"
git commit -m "feat: 评估 token 明细入库并在详情页悬停展示，移除日志 localMs 字段"
```

Expected: 一条 commit，仅含上述 6 个文件。**不 push**（用户自行推送）。
