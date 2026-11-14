# 评估 token 明细展示 + 删除 localMs 设计

日期：2026-08-13

## 背景

- `[ai-usage]` 日志（`lib/services/ai-usage-log.ts`）目前记录 `localMs` 字段，该字段（本地提示词拼接耗时，通常 <20ms）无实际价值，用户希望删除。
- 简历详情页头部目前只展示评估总 token（`PositionEvaluation.tokenUsage`），用户希望看到 token 构成（输入 / 输出 / 缓存命中 / 未命中 / 思考链），避免看日志。

## 已确认的决策

| 决策点 | 结论 |
|--------|------|
| 展示形式 | 头部 `Tokens: 8333` 保留总数，悬停 Tooltip 展示明细（shadcn Tooltip） |
| 历史数据 | 不回溯，老记录（4 个明细字段为 NULL）只显示总数，不显示 Tooltip |
| 覆盖范围 | 只做筛选评估（screening），不纳入信息抽取（extraction） |
| 存储方案 | `PositionEvaluation` 加 4 个 Int? 字段，未缓存 = 输入 − 缓存由前端推导，不另存 |

## 设计

### 1. Schema（`prisma/schema.prisma`，PositionEvaluation）

```prisma
promptTokens      Int?   // 输入 token
completionTokens  Int?   // 输出 token
cachedTokens      Int?   // 输入中缓存命中
reasoningTokens   Int?   // 输出中思考链
```

`./dev.sh npx prisma db push && npx prisma generate`（SQLite 加列无约束问题）。

### 2. 保存明细（`lib/services/ai-screener.ts`）

`evaluationData`（约 214-225 行）在 `tokenUsage` 旁加 4 个字段，数据取自已计算的 `response.usage` / `cachedTokens` / `reasoningTokens`，无新逻辑。

### 3. 删除 localMs（3 处）

- `lib/services/ai-usage-log.ts`：`AiUsageEntry` 删 `localMs`
- `lib/services/ai-screener.ts` 日志调用：删 `localMs` 行（`apiMs` 保留）
- `lib/services/resume-data-extractor.ts` 日志调用：删 `localMs: 0`

### 4. aggregate 脚本连带修改（`scripts/token-test/aggregate.ts`）

不删会输出 NaN：`UsageRow` 删字段、Markdown 明细表删"本地处理ms"列、汇总删"平均本地处理 ms"行、CSV 删对应列。

### 5. 前端（`app/resume/detail/[id]/page.tsx`）

- 评估结果类型加 4 个可空字段
- 头部 `Tokens:` 处用 shadcn `Tooltip` 包裹：
  - 有明细：悬停弹出两列小表：输入 / 输出 / 思考 / 缓存命中 / 未命中（= prompt − cached）/ 总计
  - 无明细（老记录）：只显示总数，不加悬停
- `GET /api/resumes/[id]` 的 evaluations 为全字段查询，API 无需改动

## 验证

1. 重启服务（`ai-screener.ts` 为动态 import 模块，HMR 不生效）
2. Playwright 端到端（测试文件放 `.playwright-mcp/`）：
   - 详情页悬停 Tokens 弹出明细，数值与日志一致
   - 重新评估后详情页出现明细，`[ai-usage]` 日志不再有 `localMs`
   - 老记录只显示总数、无异常
3. 跑一次 `aggregate.ts` 确认删除后正常
4. 结束后提醒用户查看测试文件并询问是否清理

## 范围外

- extraction（信息抽取）token 不入库、不展示
- `app/api/prompts/preview/route.ts` 的 tokenUsage 不动
- 历史数据不回填
