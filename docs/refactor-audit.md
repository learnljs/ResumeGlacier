# 重构候选清单（现状盘点报告）

> 审计日期：2026-08-25 ｜ 审计方式：静态分析（五域并行）+ 关键发现人工复核
> 目的：实习项目 → 个人项目改造前的现状摸底。**只盘点，未改动任何代码。**
> 范围：全仓 TS/TSX 约 45,565 行；app/api 75 个路由；lib/services 36 个服务；components 50 个组件；app/resume 26 个页面。
> 状态：已随 D1-D6 决策更新（见 §4），死代码清单已经二次复核（见 §2-A8）。
> 执行进度（2026-10-01）：B0-B7 全部完成并提交（B0 基建 / B1 死代码+schema / B2a 类型 / B2b 废弃字段 / B3 流水线 / B4 PDF-OCR 运行时 / B5 伪视觉OCR删除 / B6 队列基类 / B7 API 硬化），`npm run lint`（tsc）零错误。⚠️ 当前环境缺 win 平台 SWC（node_modules 为 mac 拷贝），完整 build 需 `npm install`。剩余批次见 §5。

---

## 0. 健康度速览

| 维度 | 结论 |
|------|------|
| 编译状态 | ✅ 已修复：isExposureCard / webhookTargetRecordId schema 漂移（B1）+ 废弃字段流通（B2b）后，`npm run lint`（tsc）零错误、`npm run build` 通过 |
| 依赖安装 | ✅ 已修复：`@next/swc-linux-x64-gnu` 移出 dependencies（B0）后 macOS arm64 可安装 |
| lint 脚本 | ✅ 已修复：`next lint`（Next 16 已移除）改为 `tsc --noEmit` + `typecheck` 脚本（B0） |
| 测试 | 零测试文件；`vitest.config.ts` + vitest 依赖是死配置（未处理） |
| 版本控制 | ✅ 已建 git 仓库并建立基线（B0），重构均有 diff 对照 |
| 企业微信残留 | 代码层已清理干净（仅文档/注释里描述"替代关系"），无需担心 |
| 安全 | ✅ 无鉴权 SQL 控制台已随数据模块下线（见 §5 额外调整）；CRON_SECRET fail-open 待修（B7） |
| 类型安全 | ✅ 服务层 `any` 已收紧（B2a）；剩余 any 在 PDF/OCR 基建内属合理（pdfjs 内部类型） |
| 重复代码 | ✅ 5 大重复簇已收敛其 4（B3 解析流水线 / B4 PDF-OCR 运行时 / B2b 字段流通 / B2a 类型）；drawImage 补丁与队列基类待办（B4 备注 / B6） |

---

## 1. S 级：先修（行为风险 / 阻塞项）

### S1. `isExposureCard` schema 漂移 —— ✅ 已修复（B1）
- **证据**：`lib/services/resume-generator.ts:81,123`、`lib/services/email-fetcher.ts:268`、`scripts/full-mailbox-sync.ts:200` 裸写 `isExposureCard` 进 `prisma.resume.create/update`；`lib/services/trend-service.ts:600,627` 用它做 where 过滤；但 `prisma/schema.prisma` 的 Resume 模型（121-160 行）**没有该字段**，grep 全仓 schema 零命中。
- **影响**：若 Prisma 客户端是当前 schema 生成的 → `npm run build`/`tsc` 直接报错；若是旧的 → 下次 `prisma generate` 必炸。「曝光卡」功能处于半移除状态。
- **决策（D2）**：**彻底删除功能**。工作区 `prisma/data/` 不存在（从未 db:setup），无数据依赖，删除零风险；部署环境 DB 若残留旧列无害。
- **动作（已完成）**：删 4 处打标（email-fetcher:268、resume-generator:81,123、full-mailbox-sync:200）+ 2 处查询（trend-service:600,627）+ 2 个孤儿 API（position-trends/batch、exposure-card-trends）+ 图表 exposure-card 分支（B8 组件清理时处理）。schema 无需动。
  - **补记（`fb921a5`）**：图表侧的 count/exposure-card 分支当时并未清理干净——两个 API 只删了 `route.ts` 留下空目录，`trend-service` 的多职位函数与 `types/trend.ts` 的曝光卡/多职位类型也都还在。B10 收尾时一并清掉（含唯一调用方为 `mode="simple"` 的图表本体，639→232 行）。

### S2. 依赖与 lint 基建坏了
- `package.json` dependencies 含 `@next/swc-linux-x64-gnu: ^16.2.11`（Linux x64 专属）→ 在 macOS arm64 上 `npm install` 直接报 `notsup` 失败。**删除该行**（next 会自动按平台装自己的 swc 包）。
- `"lint": "next lint"`：Next 16 已移除 `next lint` 命令（15 弃用、16 移除），且 devDependencies 无 eslint → 脚本必挂。先改为 `tsc --noEmit`（新增 `typecheck` 脚本），eslint 接入列为 backlog。
- `@playwright/test` 误放 dependencies（应移 devDependencies）；`react-is` 钉死 ^19.2.7 而 react/react-dom 是 latest，版本策略不一致。
- 顺带：`"private": false` → 按 D3 决策设 `true`。

### S3. 跟进创建 `'unassigned'` 占位职位 → 外键违规 500
- **证据**：`app/api/follow-up/records/route.ts:211`、`app/api/follow-up/records/batch/route.ts:84`：`positionId: resume.positionId || 'unassigned'`。但全仓不存在 id='unassigned' 的 Position 行（grep 确认）。
- **影响**：UNASSIGNED 简历走跟进 → Prisma P2003 外键违规 → 500 且泄漏内部错误。
- **动作**：提取 `findOrCreateEvaluationForFollowUp(resumeId)` 共享服务：无岗位时返回 400「请先分配职位」，两处复用。

### S4. 非法查询参数 → NaN → 500（7 处）
- `app/api/resumes/route.ts:144-145`（page/pageSize 裸 parseInt、无上限）、`follow-up/records/route.ts:7-8`（`Math.max(1, NaN)=NaN` 失效）、`67-68`（scoreMin/scoreMax 直接进 gte/lte）、`task-batches/route.ts:8`、`task-batches/[id]/route.ts:13-14`。
- **动作**：lib/utils 增加 `parseIntParam(param, fallback, {min, max})`，pageSize 上限 100，全仓统一。

### S5. 鉴权旁路与无鉴权 SQL 控制台
- `app/api/cron/scheduler/route.ts:10`、`app/api/cron/fetch-emails/route.ts:9`：`if (cronSecret && ...)` —— CRON_SECRET 未配置时条件恒真 → 鉴权整体放行（fail-open）。**待修（B7）**。
- `/api/config/database/query`：无鉴权原始 SQL 控制台 —— **已随数据模块页下线一并删除**（2026-08-26，见 §5 额外调整）。
- **动作**：CRON_SECRET 缺失时 fail-closed（401）。（B7 待办）

### S6. 错误响应三态不一致 + 内部异常泄漏
- 全仓 88 处 `NextResponse.json({ error: error.message })` 直接把 Prisma/SQL/AI SDK 内部文本回给客户端；resumes/route.ts:378 用英文固定消息；task-batches/[id]/route.ts 用中文固定消息。
- **动作**：泛化已有的 `lib/services/webhook-error.ts` 的 `webhookErrorResponse` 为 `apiErrorResponse(error, fallbackMsg)`，生产返回固定中文消息 + console.error 记内部错误。

---

## 2. A 级：重构主战场（重复 / 耦合 / 复杂度）

### A1. 解析流水线三份实现（行为已分叉）
- 「邮件主题姓名兜底 → 解析 → 质量门禁 → 破碎拦截 → 职位匹配 → 结构化提取 → NameUpdate」整条链在 `lib/services/parsing-worker-processor.ts`、`app/api/resumes/[id]/reparse/route.ts`、`app/api/resumes/[id]/refetch/route.ts` 各实现一份。
- 门禁常量 `QUALITY_THRESHOLD=40`/`MIN_TEXT_LENGTH=50` 3 处重复；**refetch 路径缺 hadFragmentation 破碎门禁**（同 PDF 破碎文件经 refetch 会进 PENDING，另两条路径会拦）——行为不一致。
- `subjectPattern` 取值有分歧：worker 读 `resume.emailConfig.resumeSource.subjectPattern`，reparse/refetch 读 `resume.resumeSource.subjectPattern` [待核实权威 relation]。
- **动作**：下沉 `lib/services/parse-pipeline.ts` 的 `runParsePipeline(resumeId, opts)`；门禁常量收敛 `assertParseQuality(parseResult)`。

### A2. 结构化提取 + NameUpdate 五处重复
- `parsing-worker-processor.ts:159-184`、`batch-extract/route.ts:43-68`、`[id]/extract/route.ts:40-68`、`[id]/refetch/route.ts:193-222`、`[id]/reparse/route.ts:133-166`，各约 20 行、各有变异（rawJson 判断、gate、phone/email 写入、日志前缀）。
- **死路由**：`app/api/resumes/batch-extract/route.ts` 全仓零引用（前端/文档均无调用）。
- **动作**：`lib/services/structured-data-saver.ts` 的 `saveStructuredData(resumeId, text, fallbackName, opts)` 五处复用；删除 batch-extract 死路由。

### A3. pdfjs 基建重复（8 处 polyfill + 3 份行为分叉的 drawImage 补丁 + 2 份 Tesseract worker）
- `process.getBuiltinModule` polyfill 在 8 个文件各写一份（正典 `lib/polyfills/pdfjs-polyfill.cjs` 被 5 个 service 绕过内联复制）。
- drawImage 补丁 3 份且已分叉：vision-ocr.ts:459 返回 `[tempCanvas, ...args.slice(1)]`，另两份原样返回 args。
- Tesseract worker 初始化近 60 行在 ocr-engine.ts 与 vision-ocr.ts 完全重复。
- 死代码：`lib/webpack/pdfjs-polyfill-plugin.js` 零引用（已复核）；next.config.mjs DefinePlugin 注入的 `PDFJS_POLYFILL` 无读取方。
- **动作**：抽 `lib/services/pdf-render-utils.ts`（patchDrawImage / getTesseractWorker / pdfjsConfig），删除死插件与死配置。

### A4. 两个后台队列骨架约 70% 重复
- `resume-parsing-queue.ts` 与 `screening-queue.ts`：私有字段、init、runWorker 循环、recoverOrphans、getStatus 全部同构，仅 processItem 不同。
- **动作**：抽抽象基类 `BaseResumeQueue`（globalThis 单例通用化），两队列变薄封装。

### A5. 跟进状态机正向流转表双源真相
- 页面 `app/resume/follow-up/page.tsx:220-278` 硬编码 `FOLLOW_UP_ACTIONS`（注释自认"与 follow-up-transitions.ts 保持一致"），服务层 `FORWARD_TRANSITIONS` 才是权威——漂移后页面按钮与后端校验行为不一致。
- **动作**：服务层补充 UI 元数据（label/icon/kind），页面由 FORWARD_TRANSITIONS 派生。

### A6. 得分阈值/颜色规则四处实现且互相矛盾
- list『>=80 绿 / >=60 蓝 / >=30 黄』；screened/follow-up『>=40 黄』（text-red-600 vs 500）；reevaluate『>=80 success / >=60 secondary / 其余 destructive』无黄档。
- **动作**：单一 `scoreColor(score)` 档位函数（lib/constants/score.ts），四页统一。

### A7. 八大上帝页面（单文件巨型客户端组件）
- `follow-up/page.tsx` 2733 行（主组件 2185 行、48 个 useState、8 个内联 Dialog、内嵌 NoteCell/FilterTagRow/ContactedMultiSelect 等）、`reevaluate` 1512、`detail/[id]` 1209、`list` 1049、`database` 964、`screened` 856、`task-batches` 843、`email` 813。无 React.memo，任何输入触发整页重渲染。
- 明确提取候选：NoteCell→`NoteCell.tsx`；FilterTagRow→`follow-up-filter-bar.tsx`；ContactedMultiSelect→`contacted-multi-select.tsx`；8 个跟进弹窗→`follow-up-dialogs.tsx`；ScoreBadge→`score-badge.tsx`；StarBar 并入 star-rating readonly 模式；SkeletonRow→`table-skeleton.tsx`；database 的 SQL 编辑器→`sql-console.tsx`。

### A8. 死代码（已二次复核）
| 项 | 复核结论 | 处置 |
|---|---|---|
| `BatchFollowUpBar.tsx`（301 行） | 真死（仅自身定义） | 删 |
| `BatchSelectionBar.tsx`（136 行） | 真死 | 删 |
| `quickExtractForScreening`（55 行） | 真死 | 删 |
| `filterCandidates`（22 行） | 真死 | 删 |
| `visionOcr`（43 行）+ 死导入 `getAIConfigByPurpose` | 真死（`visionOcrPdf` 在用，别删） | 删函数与导入 |
| `lib/webpack/pdfjs-polyfill-plugin.js`（24 行） | 真死（零引用） | 删 |
| next.config.mjs 的 `PDFJS_POLYFILL` DefinePlugin | 无读取方 | 删配置 |
| `batch-extract/route.ts` | 零引用 | 删 |
| ContactResultSelector 的 `variant="filter"` + `includeAll` | 本轮实测零引用（筛选侧走 `ContactedMultiSelect`） | 已删（`86c735f`） |
| `position-trends/batch`、`exposure-card-trends` 路由 | 仅被图表 exposure-card 分支引用 | 路由文件已在 B1 删除，**残留空目录于 `fb921a5` 清掉**；图表的 count/exposure-card 两分支同批删除 |
| `weight-model-group/card`、`question-details`、`PdfPreview`、`DocxPreview`、`prompt-version-history` | **误报，均在用** | 保留 |

### A9. 组件命名约定冲突（决策 D1：统一 PascalCase）
- 文档（CONTRIBUTING.md:111、REVIEW.md:41、CLAUDE.md）规定 PascalCase，实际 34 个业务组件 18 个 PascalCase + 16 个 kebab-case 混用；文档示例 `ScoreCards.tsx` 已过时（实际是 score-cards.tsx）。
- **动作**：批量重命名 16 个 kebab-case 文件为 PascalCase（先改 import 引用再改文件名），同步修正文档。

### A10. 组件层重复簇
- 标签选择 UI 4 处重复（FollowUpDialog/BatchFollowUpDialog/TagEditPopover/BatchFollowUpBar 各自 TAG_COLORS + loadTags + toggleTag + 新建表单）→ 抽 `TagPicker` + 统一 Tag 类型。
- 星级评分 3 套（StarRating 组件 / dimension-evaluator 内联编辑器 / '⭐'.repeat() 散落 6 处）→ StarRating 加 readonly 模式。
- ~~`aiDetail` 兼容层 `as unknown as X` 双断言链（prompt-editor:428,434、evaluation-evidence:71,187、StructuredDataView:62-68）→ 定义 discriminated union，API 层归一化~~ ✅ 已收敛（`types/ai-detail.ts` + `parseAiDetail()`，提交 `764f667`）
- ~~ContactResultSelector 两个变体 listbox JSX 95% 相同 + 自实现整套键盘导航（与 ui/popover、ui/select 三套下拉并存）。~~ 面板 JSX 已抽为 `components/ui/listbox-panel.tsx`（`6db1e32`）；**复核修正**：`variant="filter"` + `includeAll` 全仓无调用方（筛选侧实际用 `ContactedMultiSelect`），**死分支已删**（`86c735f`，441→320 行），组件只剩 inline 一种形态。键盘导航仍为自实现——换 Radix Popover 无法消除且会改掉「滚动即关闭」行为，留待交互原语统一时收敛。
- ~~权重编辑（数字钳制/onBlur 归一化/总和校验/WeightModelData 接口三处定义）→ `useWeightInput` hook~~ ✅ 已收敛（`lib/hooks/use-weight-input.ts` + `WeightModelRecord`，提交 `1a12be2`；第三处实为 API 侧校验 `weight-models/route.ts`，保留）
- 时间格式化 10+ 页面零散 `toLocaleString('zh-CN')` + BoardPeriodPicker 自建整套周历工具 → `lib/utils/date.ts`。
- 组件内 33 处直接 fetch，错误判定混用 `json.error` / `!res.ok`，3 处静默吞错 → `lib/api/client` 统一封装。
- ~~交互原语各写各的：14 处原生 `window.confirm`（原文档记 5 处，已过时）+ 6 处手写 `fixed inset-0` 模态框（FollowUpDialogs ×4、PromptVersionHistory、PromptEditor、prompts 脏状态确认）~~ ✅ 已收敛：新增 `components/ui/confirm-dialog.tsx`（Promise 版 `confirmDialog` + `ConfirmDialogHost`，宿主缺失时退化原生 confirm）+ 6 处模态框换 `ui/Dialog`（提交 `6f292ca` / `1dacc1f`）。**遗留**：`FollowUpLogDrawer`（侧滑抽屉）与 `DimensionEvaluator`（底部编辑条）需 Sheet 变体并覆盖 Radix 默认居中/缩放动画，未动。

### A11. scheduler 绕过状态机
- `scheduler.ts:233-283`（每日 02:00 离职扫描）直接 `followUpRecord.update({status:'RESIGNED'})` + 写日志 + 入 webhook 队列，绕过 `validateTransition`（仅 API 路由在用）→ 状态机合法性与副作用双轨维护。
- **动作**：抽 `applyTransition(recordId, toStatus, ...)` 共享服务。

### A12. 事务缺失
- `positions/route.ts:44-71`：职位 + 2 权重模型 + 回写默认模型，4 次写无事务，中途失败产生半成品职位。
- 标签替换 3 处非事务 deleteMany + create（records/[id] PATCH/PUT、records POST），崩溃丢标签。

---

## 3. B 级：个人化 / 清理

### B1. 废弃字段流通
- `Resume.initialScore/compositeScore/screenedDate` 仍在 schema（147-150 行，死列、无写入方），前端 follow-up/screened/list/detail 仍以 `resume.initialScore` 读取，靠 API 兼容层（resumes/route.ts:367、follow-up/records/route.ts:135-136 从 PositionEvaluation 注入）——某 API 忘映射即静默 null。
- **动作**：前端改读 evaluation 字段 → 删除兼容映射 → 重建表删列（SQLite 无 ALTER COLUMN）。

### B2. 着陆页名存实亡（决策 D6：纯 redirect + 删死链接）
- `app/page.tsx` 退化为 4 行 `redirect('/resume/dashboard')`，但 layout 仍有「返回首页」链接指向 / → 点击即被重定向回来，自循环死链接。
- **动作**：维持 redirect，删除侧边栏/移动端「返回首页」死链接。

### B3. 设计令牌逃逸 ~128 处
- `app/resume/*` 硬编码 Tailwind 默认色（bg-gray-100/bg-yellow-100/text-blue-600/border-green-200 等），globals.css 的 --success/--chart-* 令牌基本未用，与「墨金·朱」体系并存。
- 得分/状态徽章颜色优先令牌化（配合 A6 档位函数）。

### B4. 导航与文档漂移
- `app/resume/layout.tsx:32,43`：分组 href `/resume/recruitment`、`/resume/task-management` 指向不存在路由（仅作展开 key）。
- README：`docs/API.md（即将生成）` 但 docs/ 目录不存在且被 .gitignore 忽略；模型数「15 个」vs 实际列举 16；API 组数 9/10 vs 实际 11；「生产构建 node server.js」vs CLAUDE.md 已改为 `npm start`。
- `NEXT_PUBLIC_BASE_PATH` 文档声明但代码零读取。

### B5. 品牌残留（决策 D3：保留 ResumeGlacier，指向个人 repo）— ✅ 已完成
- ✅ package.json：`name: resume-glacier`（保留，产品名不动）+ `author` 改 `learnLJS`、homepage/repository/bugs 改 `github.com/learnLJS/resume-glacier`；`private` 保持 `true`（本条原描述写「private: false」与实际不符，以实际为准）。
- ✅ README / CONTRIBUTING 全篇 org 链接改 `learnLJS/resume-glacier`（README 1 处 + CONTRIBUTING 5 处）。CONTRIBUTING「Fork & Clone」的 `<your-username>` 占位按原意（贡献者克隆自己的 fork）保留，补了一行说明注释。
- ⚠️ `learnLJS/resume-glacier` 仓库尚未在 GitHub 创建（此前托管于 Gitee），建仓 push 后链接才生效。
- ✅ **deploy/ 复核（前提纠偏）**：deploy/ 内**无任何 Docker 内容**，与 CLAUDE.md「无需 Docker」并不冲突——原判断是过时假设。实际处置：删 4 个冗余 `.gitkeep`（所在目录均已有真实文件）、修 2 处失效路径（`doc/dev/...` → `docs/dev/跟进管理模块/...`；SQL 头部执行路径补 `prod/`）、给手工 SQL 与部署文档补「已应用（2026-07-07），新环境直接 `npm run db:setup`」状态说明。`deploy/env/*.md` 依 REVIEW.md §5.3 属只读基准，未动。

### B6. 其他 — ✅ 已完成
- ✅ `full-mailbox-sync.ts` 清空前强确认（`a4c24dc`）：打印删除数量与影响面，交互终端须输入完整 `yes`，非交互终端默认拒绝（需显式 `--yes`）。
- ❌ **`candidate-pool/route.ts:32` 引用废弃状态 `PARSED` —— 复核为误报**：该行是注释「候选池挑人：待筛选（PENDING）+ 已筛选（SCREENED）。PARSED 已废弃（迁移至 PENDING）」，不是代码引用，无需改。
- ✅ `scripts/` 纳入类型检查（`f053770`）：新增 `tsconfig.scripts.json`，`lint` / `typecheck` 改两轮 tsc。（`align-xlsx-filename.ts` 里若干 `any` 未动，属脚本工具代码，本轮不强求）
- ✅ `app/resume/test-photo/page.tsx` 已删除（`3b44c50`）——覆盖 `globalThis.fetch` 的调试页，会随构建在生产暴露。

---

## 4. 已裁决决策点（2026-08-25）

| # | 决策 | 结论 |
|---|------|------|
| D1 | 组件文件命名 | **统一 PascalCase**（遵文档），B10 批量重命名 16 个文件 |
| D2 | 曝光卡（isExposureCard） | **彻底删除功能**（见 S1），无数据风险 |
| D3 | 品牌与版本控制 | **保留 ResumeGlacier**，个人 repo + `private: true`；git init 已建 |
| D4 | AI 视觉 OCR 第 4 级 | **删除**（B5，⚠️ 需先实测对比再删，避免识别率回退） |
| D5 | 死代码处理 | **先复核再删**（已完成，见 A8） |
| D6 | 着陆页 | **纯 redirect + 删死链接**（见 B2） |

---

## 5. 修订批次计划（决策落地后）

✅ = 已完成并提交 ｜ ⏳ = 待办

1. **B0 基建修复** ✅：git init + 首次提交；package.json（删 swc 平台包、lint→tsc --noEmit、`@playwright/test` 移 devDeps、`private: true`）；.gitignore（docs/ 入库、运行时产物）；`npm install` 通过。
2. **B1 死代码 + 曝光卡删除** ✅：A8 清单死代码删除 + isExposureCard 清理面 + Position.webhookTargetRecordId 补字段；`npm run build` 恢复通过。
3. **B2a 服务层 any 收紧** ✅：ai-config-helper / email-fetcher / webhook-delivery-queue / task-batch-service 的 any 全部替换为精确类型。
4. **B3 解析流水线收敛** ✅：parse-pipeline（assertParseQuality / saveStructuredData / FRAGMENTATION_REASON）+ matchPositionForResume 统一入口；refetch 补破碎门禁（行为修复）、reparse findUnique 移入 try。
5. **B2b 废弃字段流通收敛** ✅：API 移除 resume.initialScore/compositeScore 扁平注入；follow-up/list/screened 改读 evaluation / positionScores；全仓前端已无废弃同名读取。
6. **B4 PDF/OCR 运行时收敛** ✅：pdf-common.ts（polyfill 统一走正典 .cjs + pdfjsConfig + 健壮版 Tesseract worker 单例）；5 个 service 副本清除；冒烟测试通过。⚠️ drawImage 三份补丁行为分叉，合并需真实 PDF 回归验证，延后。
7. **B5 OCR 第 4 级删除** ✅：删除 vision-ocr.ts（伪 AI 视觉通道），回退链收敛为 直接提取→Tesseract OCR；修正「AI视觉识别完成」误导日志与 CLAUDE.md/README 描述。⚠️ 对扫描件识别率可能有影响，建议真实扫描件回归。
8. **B6 队列基类** ✅：BaseResumeQueue 抽象基类收敛 parsing/screening 两队列约 70% 骨架（init/worker 循环/孤儿恢复/getStatus），差异通过钩子表达；冒烟测试通过。
9. **B7 API 硬化** ✅：S3-S6 剩余项（unassigned、parseIntParam、apiErrorResponse、CRON fail-closed、事务）+ 其他路由小项；详见《代码重构.md》§4 B7。
10. **B8 规则单点** ⏳：scoreColor、状态枚举、日期工具、状态机 UI 元数据（A5/A6）。
11. **B9 页面拆分** ⏳：follow-up 2733 行逐步提取（A7），拆分时顺带 PascalCase 命名。
12. **B10 组件收敛** ⏳：TagPicker、StarRating readonly、16 个 kebab-case 文件重命名 PascalCase（A9/A10）。
13. **B11 个人化清理** ⏳：着陆页死链接、README/CONTRIBUTING 品牌指向个人 repo、导航 href 修正（B 级）。
14. **B12 UI 令牌化 + 响应式** ⏳：128 处色值 → 设计令牌；响应式补齐。

### 已完成的额外结构调整（不在原批次计划内）
- **导航**：简历任务提升一级；邮件管理组下线（邮件列表页删除，保留 /api/emails/status 与 /api/emails/fetch）。
- **邮箱状态整合**：功能并入 系统配置→邮箱配置页（每卡片 增量/全量 按钮）+ 数据概览顶部一键收取按钮。
- **下线标签管理页与数据模块页**（含 /api/config/database/*，顺带消除无鉴权 SQL 控制台高危面 S5）；标签选择面板支持删除手动标签（AI 标签禁删，级联清理关联）。

> 详细提示词模板见 `docs/refactor-prompts.md`，重构执行约束见 `.claude/skills/refactor.md`。
