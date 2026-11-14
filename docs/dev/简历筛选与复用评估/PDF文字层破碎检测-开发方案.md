# PDF 文字层破碎检测 — 开发方案

## 一、背景

### 1.1 问题

某些 PDF（扫描 + OCR 输出、国产 PDF 生成器、在线简历模板）在写入时把每个字符绘制成独立的 `(x,y) Tj` 操作 + 大量空 Tj,造成 pdfjs `getTextContent()` 返回大量空字符串 item 和单字碎片 item。

**实际案例**:周艳如简历(`cmsg2tgaz005d4wf5ynzp89bg`)通过 pdfjs 提取得到 144 个 text item,其中 **57 个是空字符串(40%)**,大量"主修"、"、"、"市"、"通,掌握"等单字碎片,姓名、公司、学校、专业、工作描述内容**全部丢失**。

### 1.2 与现有方案的关系

`PDF简历文本提取准确性提升-开发方案.md` 解决了**顺序错乱、banner 丢失、字体子集泄漏串**三类问题,但未覆盖本类"文字层破碎"乱码。该方案的"阶段 2 / 阶段 3"以视觉排序为修复路径,但**当 PDF 文字层本身就是碎片**时,视觉排序也救不回来。

### 1.3 当前质量门禁为何没拦住

`analyzeTextQuality`(`lib/services/text-quality-detector.ts`) 6 项加权打分(可识别字符比率、CID、PUA、文本密度、重复模式、语义内容)。周艳如案例:

- 文本长度 224 字符 → 文本密度项 100 分
- 关键词命中"姓名/邮箱/工作/公司/经验/技能"等 ≥ 5 个 → 语义内容项 100 分
- 总分 > 40 阈值 → 判为合格

**关键判断**:这 6 项是**滞后指标**——只识别"提取出的文本像不像文本",识别不了"提取出的文本是否完整"。文字层破碎必须从源头统计 item 级别特征,质量门禁才能识别。

### 1.4 目标

- 不改数据库 schema
- 不引入新依赖
- 不破坏现有 6 项检测和 OCR 回退链路
- 让质量门禁识别"文字层破碎型 PDF",自动走 OCR 回退
- 历史脏数据可通过现有 reparse 按钮手动回填,无需新增 UI
- **OCR 兜底全部失败时,脏文本不得绕过破碎检测入库**——要么保持 ERROR,要么抛错,不能静默"成功"
- 多页 PDF 按页统计,**任一页破碎即整体判乱码**,避免跨页累加稀释漏检

---

## 二、总体方案

```
pdf-visual-extractor 主循环
   ↓ 统计 item 级 metrics（跨页累计 + 单页最大值诊断）
FragmentationStats { totalItems, emptyItems, singleCharItems, emptyItemRatio, singleCharItemRatio, maxPage* }
   ↓ 透传
analyzeTextQuality(text, stats?)
   ↓ 硬短路（累计 emptyRatio 与 singleCharRatio 同时超阈值）
isGarbled = true
   ↓
现有 OCR cascade (ocrPdfPages → visionOcrPdf)
   ↓
兜底失败时：sourceTextBroken=true → 拒绝回退脏文本 → ERROR
```

单 PDF 提取路径下,新增"item 级 metrics"统计并透传给质量门禁。命中硬短路阈值即判乱码,触发现有 OCR cascade 兜底。

### 设计原则

1. **确定性逻辑禁止交给模型**(CLAUDE.md) — 阈值 = 显式常量,统计 = 显式计数,不调 AI
2. **不破坏现有 6 项** — 新规则作为硬短路,weight=0,不参与加权 score
3. **零额外性能成本** — 在 pdf-visual-extractor 主循环内**先统计后过滤**,不二次解析
4. **避免 OCR 递归** — `analyzeTextQuality` 第二个参数**可选**;vision-ocr.ts 内的两次调用不传,自动 skip
5. **组合判定防误伤** — 摸底(§3.4,60 份历史 PDF)证明单一指标无法区分破碎与正常排版:正常简历要么空格排版(empty 高但 singleChar 低,如董琳琳 33%+24%)、要么逐字排版(singleChar 高但 empty 低,如岳永腾 7%+93%)。**破碎必须 `emptyRatio > 0.30` 且 `singleCharRatio > 0.40`(累计值同时超)才触发**。单页 max 比值在小页面(item 少)时产生统计噪声导致误伤(薛丰某页 singleChar 单页 50%),仅保留为诊断字段,不参与触发
6. **破碎判定必须"传染"** — 一旦原始文本被判破碎,OCR 兜底失败后回退的 fallback 文本也必须保持乱码状态,不得静默入库

---

## 三、阈值与权重

### 3.1 检测阈值(基于周艳如案例 + 保守初始值)

| 检测项 | 案例实测(周艳如) | 阈值 | 余量与说明 |
|--------|---------|------|------|
| `totalItems` | 144 | 24 最小值 | 守卫避免误伤极简简历(廖炜杰仅 3 item) |
| `emptyItemRatio` | 0.404 | **0.30** | 单独不可用(正常简历空格排版也达 30-48%,如董琳琳 33.5%);**必须与 singleCharRatio 组合 AND** |
| `singleCharItemRatio` | 0.482 | **0.40** | 单独不可用(正常逐字排版简历达 87-93%,如岳永腾 93.2%);**必须与 emptyItemRatio 组合 AND** |

**⚠ 空格 item 的统计口径**:
- `emptyItems` 按 `str.trim() === ''` 计,**包含纯空格 item(str=" ")**。摸底证实空格排版是正常简历的合法特征(董琳琳 empty 33.5% 文本完整),故 empty 单指标不能单独判破碎
- 真破碎(周艳如)的空 item 由"字符间空格 + 空白占位"共同构成(纯空 20.6% + 空白 19.9%),与 normal 排版难以用 empty 区分,必须靠 singleChar 组合

**触发条件(全部满足才破碎)**:
- `totalItems >= 24`
- `emptyItemRatio > 0.30`(跨页累计)
- `singleCharItemRatio > 0.40`(跨页累计)

**依据(§3.4 摸底,60 份历史 PDF 实测)**:OR 逻辑误伤 48/60(正常简历 empty 普遍超 0.30 或 singleChar 超 0.40);单页 max 误伤薛丰(某页 item 少导致单页 singleChar 50% 的统计噪声);**累计 AND 组合 0 误伤、精准命中周艳如(唯一真破碎)**。maxPageRatio 保留为诊断字段但不参与触发。

### 3.2 权重策略 — 硬短路,不参与加权

**`WEIGHTS` 总和保持 1.00 不变**,现有 6 项权重 0 调整。新规则作为独立 check 项,`weight: 0` 直接进 `checks` 数组:

| 条件 | check.score | check.passed | hardGarbled | check.weight |
|------|-------------|--------------|-------------|--------------|
| `stats` 为 `undefined`(OCR 文本上下文) 或 `totalItems < MIN_TOTAL_ITEMS` | 100 | true | false | 0 |
| `emptyItemRatio ≤ 0.30` 或 `singleCharItemRatio ≤ 0.40`(至少一个指标未超,即非破碎) | 100 | true | false | 0 |
| **`emptyItemRatio > 0.30` 且 `singleCharItemRatio > 0.40`(累计值同时超)** | 0 | false | **true** | 0 |

> **AND 组合是 §3.4 摸底校准的核心结论**:破碎 = 两个累计指标同时超阈值;任一指标未超即正常(覆盖空格排版与逐字排版两类正常简历)。maxPage 不参与判定。

**核心收益**: 历史简历评分零变化,新规则只对"文字层破碎型 PDF"产生硬短路命中。

### 3.3 阈值常量集中定义

`lib/services/text-quality-detector.ts` 顶部常量区新增:

```typescript
const FRAGMENTATION = {
  MIN_TOTAL_ITEMS: 24,
  EMPTY_RATIO: 0.30,
  SINGLE_CHAR_RATIO: 0.40,
} as const
```

后续单独 PR 调整即可,不影响接口。

### 3.4 实施前必做:历史数据摸底(阈值校准)

**在实现 §4 之前,先对历史已成功解析的简历跑一次 stats 分布摸底**,确认阈值不会误伤:

| 摸底样本 | 目的 | 通过标准 |
|---------|------|---------|
| 20-30 份已成功解析(`parseMethod='text'` 且人工确认内容完整)的 PDF | 正常 PDF 的 `emptyItemRatio` / `singleCharItemRatio` 分布 | 95% 样本两指标均 < 0.20;若有样本 > 0.25 则阈值需上调 |
| 5-10 份已知乱码/ERROR 的 PDF | 破碎 PDF 的分布 | 95% 样本至少一个指标 > 阈值,保证检测有效 |

摸底方式:临时脚本对每个 PDF 调 `extractTextByVisualOrder(buffer, { includeStats: true })` 打印 stats。该改动本身即 §4.2 的内容,**实现顺序:先实现 §4.2 统计 → 跑摸底 → 再定阈值常量**,而不是先写死阈值再验证。

**摸底结果(2026-08,对 60 份历史 PDF 实测)**:

| 判定逻辑 | 误伤样本 | 漏检 |
|---------|---------|------|
| 文档初版 OR(empty>0.30 OR single>0.40) | 48/60(正常简历大面积误伤) | 0 |
| 单页 max AND | 薛丰(正常简历,某页 item 少导致单页 singleChar 50%) | 0 |
| **累计 AND(empty>0.30 AND single>0.40)** | **0/60** | **0(周艳如精准命中)** |

正常简历的两类排版:
- 空格排版(如董琳琳):`empty` 33% 但 `singleChar` 24% —— 文本完整可读
- 逐字排版(如岳永腾/haner/区慧敏):`singleChar` 87-93% 但 `empty` 7-10% —— 文本完整可读

单一指标无法区分;只有破碎 PDF(周艳如:`empty` 40.4% & `singleChar` 48.2%)两个累计指标同时超。

**结论:采用累计 AND 组合,废除单页 max 触发**(maxPage 仅保留为诊断字段)。

---

## 四、完整改动清单

### 4.1 `types/resume.ts` — 新增类型

在 `ItemProgress`(`types/resume.ts:88-91`)之后新增:

```typescript
// PDF 文字层破碎统计（由 pdf-visual-extractor 输出）
export interface FragmentationStats {
  totalItems: number          // pdfjs 返回的原始 item 数（含空 item，跨页累加）
  emptyItems: number          // str.trim() === '' 的 item 数（跨页累加，含纯空格 item，见 §3.1）
  singleCharItems: number     // str.trim().length === 1 的 item 数（跨页累加）
  emptyItemRatio: number      // emptyItems / totalItems（跨页累计比值，参与 AND 触发判定）
  singleCharItemRatio: number // singleCharItems / totalItems（跨页累计比值，参与 AND 触发判定）
  maxPageEmptyRatio: number   // 单页 emptyItemRatio 最大值（诊断字段，不参与触发判定，见 §3.4）
  maxPageSingleCharRatio: number // 单页 singleCharItemRatio 最大值（诊断字段，不参与触发判定）
}
```

**`VisualExtractOptions` 保持在 `pdf-visual-extractor.ts:44-47` 不动** — 避免外部隐性引用风险。

### 4.2 `lib/services/pdf-visual-extractor.ts` — 统计并返回 stats

| 行号 | 改动 |
|------|------|
| 顶部 1-26 注释区 | "已知限制"后追加一行"v2 增加:item 级 metrics 用于文字层破碎检测" |
| 49-55 `PositionedTextItem` 之后 | 新增 `import type { FragmentationStats } from '@/types/resume'` |
| 411 主函数签名 | 重载拆分(向下兼容):<br>`extractTextByVisualOrder(buffer, options?): Promise<string>` (现有)<br>`extractTextByVisualOrder(buffer, options & { includeStats: true }): Promise<{ text: string; stats: FragmentationStats }>` (新)|
| 416 `const pageTexts: string[] = []` 之后 | 新增 `const stats: FragmentationStats = { totalItems: 0, emptyItems: 0, singleCharItems: 0, emptyItemRatio: 0, singleCharItemRatio: 0, maxPageEmptyRatio: 0, maxPageSingleCharRatio: 0 }` |
| 441-454 map+filter 链 | **关键修改** — 先统计后过滤,统计写入**页级临时变量**(每页循环结束再归并到全局 stats,见下一行):<br>原:`if (str.trim().length === 0) return null`<br>新:`if (str.trim().length === 0) { pageEmpty++; pageTotal++; return null }`<br>`if (str.trim().length === 1) pageSingleChar++`<br>`pageTotal++`<br>(filter 内 `isNoiseItem` 过滤项**不计入**破碎度,只算"正常但碎"的 item)|
| 页循环末尾(478 `pageTexts.push` 之后) | **按页归并**(防跨页稀释):计算本页 `pageEmptyRatio = pageEmpty/pageTotal`、`pageSingleCharRatio`,更新:<br>`stats.emptyItems += pageEmpty; stats.singleCharItems += pageSingleChar; stats.totalItems += pageTotal`<br>`stats.maxPageEmptyRatio = max(stats.maxPageEmptyRatio, pageEmptyRatio)`<br>`stats.maxPageSingleCharRatio = max(stats.maxPageSingleCharRatio, pageSingleCharRatio)`<br>(重置页级变量供下一页使用)|
| 477 日志 | 把本页 stats 一并打点:`[VisualExtractor] page=${p}, pageEmpty=${pageEmpty}/${pageTotal}, pageSingleChar=${pageSingleChar}, pageEmptyRatio=...` |
| 489 `return pageTexts.join('\n\n')` | 循环结束后计算累计 ratio,然后按 options.includeStats 返回 union:<br>无 `includeStats` → 行为完全保持不变(返回 string)<br>有 `includeStats` → 返回 `{ text: pageTexts.join('\n\n'), stats: { ...stats, emptyItemRatio, singleCharItemRatio } }`(`maxPageRatio` 已在循环内更新)|

### 4.3 `lib/services/text-quality-detector.ts` — 新增硬短路检查

| 行号 | 改动 |
|------|------|
| 顶部 import 区 | 新增 `import type { FragmentationStats } from '@/types/resume'` |
| 35 后常量区 | 新增 `const FRAGMENTATION = { MIN_TOTAL_ITEMS: 24, EMPTY_RATIO: 0.30, SINGLE_CHAR_RATIO: 0.40 } as const` |
| 98 `analyzeTextQuality` 签名 | 改为 `export function analyzeTextQuality(text: string, fragmentationStats?: FragmentationStats): TextQualityReport` |
| 123 行 `checks.push(semanticResult)` 之后 | 新增 `const fragmentationResult = computeFragmentationResult(fragmentationStats)` 和 `checks.push(fragmentationResult.check)` |
| 148 `const isGarbled = ...` | 在表达式末尾追加 `\|\| fragmentationResult.hardGarbled` |
| 155 行之后 | 新增 helper 函数 `computeFragmentationResult`(返回 `{ check: CheckDetail; hardGarbled: boolean }`;合约见 §3.2) |

**`computeFragmentationResult` 判定实现(AND 组合,§3.4 校准)**:

```typescript
interface FragmentationResult { check: CheckDetail; hardGarbled: boolean }

function computeFragmentationResult(stats?: FragmentationStats): FragmentationResult {
  if (!stats || stats.totalItems < FRAGMENTATION.MIN_TOTAL_ITEMS) {
    return { check: { name: '文字层破碎', passed: true, score: 100, weight: 0, detail: '样本不足或非PDF文本,跳过破碎检测' }, hardGarbled: false }
  }
  const { emptyItemRatio, singleCharItemRatio } = stats
  const bothExceed =
    emptyItemRatio > FRAGMENTATION.EMPTY_RATIO &&
    singleCharItemRatio > FRAGMENTATION.SINGLE_CHAR_RATIO
  if (bothExceed) {
    return {
      check: { name: '文字层破碎', passed: false, score: 0, weight: 0, detail: `检测到文字层破碎(empty=${(emptyItemRatio * 100).toFixed(1)}%, single=${(singleCharItemRatio * 100).toFixed(1)}%),强制走OCR回退` },
      hardGarbled: true,
    }
  }
  return {
    check: { name: '文字层破碎', passed: true, score: 100, weight: 0, detail: `未检测到文字层破碎(empty=${(emptyItemRatio * 100).toFixed(1)}%, single=${(singleCharItemRatio * 100).toFixed(1)}%)` },
    hardGarbled: false,
  }
}
```

> 判定只看**累计** `emptyItemRatio` 与 `singleCharItemRatio`,两者**同时**超阈值才判破碎;**maxPageRatio 不参与**。`weight: 0` 使加权 score 贡献恒为 0,历史评分零变化。

**注意**:现有 6 项 `checks.push` 顺序、`WEIGHTS` 字典、score 计算公式均**不动**。

### 4.4 `lib/services/resume-parser.ts` — 透传 stats

| 行号 | 改动 |
|------|------|
| 顶层(12 行 warnings 附近) | 新增 `let sourceTextBroken = false` 和 `let fragmentationStats: FragmentationStats \| undefined`(**必须在函数顶层声明**,才能同时被 74 行赋值与降级决策区 153-177 读取) |
| 47 `text = await extractTextByVisualOrder(...)` | 改为接收带 stats 的解构:<br>`const { text: rawText, stats } = await extractTextByVisualOrder(buffer, { onProgress, includeStats: true as const })`<br>`fragmentationStats = stats`<br>⚠ **`text = rawText`(重赋值外层 `let text`),不能 `let text = rawText`** —— 那会在 try 块内遮蔽外层变量,导致 Step 2 判空 |
| 47 options 块 | 新增 `includeStats: true as const` |
| 71 `const fallbackText = text` | 保留 `fragmentationStats` 引用(已在顶层声明) |
| 74 `const qualityReport = analyzeTextQuality(text)` | 改为 `const qualityReport = analyzeTextQuality(text, fragmentationStats)`,之后设 `sourceTextBroken = qualityReport.isGarbled`(仅当传入 stats 时有效,即 PDF 原始文本被判乱码) |
| 74 之后 | 若 `sourceTextBroken === true`:`warnings.push(\`文本层破碎检测命中(emptyRatio=..., singleCharRatio=...),进入OCR回退\`)` — **这是 §7.1 验收的 warning 来源** |
| 163 降级决策区 `else if (fallbackText.trim().length >= 30)` | 该分支(回退到原始文本)前加判断:若 `sourceTextBroken === true` → **拒绝静默回退**,push warning + throw Error(防御纵深,见下一行) |
| **降级决策区之后(OCR cascade else 块内,约 202 行)** | **关键修改(v2 兜底)** — 实测发现:OCR/vision 全部失败时 `finalText` 保持原始 text(224 字符非空),`finalText.trim().length < 20 \|\| fallbackQualityCheck.isGarbled` 不成立(单参数检测 isGarbled=false),**降级决策区根本不会进入**,优先级2 的拦截执行不到。必须在 Step 5 之后加最终保护:<br>`if (sourceTextBroken && finalText === text) { warnings.push('OCR/视觉识别均失败,原始文本存在文字层破碎,拒绝入库'); throw new Error('...残缺不可用') }`<br>逻辑:只要 OCR/vision/ocrFallbackText 任一成功替换了 `finalText`(引用 ≠ text)就不拦截;只有最终仍用原始破碎文本才 throw。throw 在函数顶层 `if (isGarbled)` 块内、不在任何 try/catch 中,传播出 parseResume 由 route 捕获 → 500 → ERROR ✓ |
| 154 `analyzeTextQuality(finalText)` | **保持单参数不变** — OCR 文本无 stats |
| 213 `analyzeTextQuality(finalText)` | **保持单参数不变** — fallback 分支已被上方保护,正常 OCR 路径不受影响 |
| 81 `if (isGarbled \|\| text.trim().length < 20)` | **无改动** — 由 isGarbled=true 自动驱动 OCR cascade |

### 4.5 `lib/services/vision-ocr.ts` — 不动

| 行号 | 不动原因 |
|------|---------|
| 501 `analyzeTextQuality(finalText)` | OCR 文本无 pdfjs item 上下文,新检查自动 skip,无递归风险 |
| 547 `analyzeTextQuality(finalText)` | 同上 |

**契约**: vision-ocr.ts 的两次调用不传第二参数 → `computeFragmentationResult(undefined)` 返回 score=100,hardGarbled=false,**物理上不可能从 OCR 路径触发 OCR**。

### 4.6 不动的文件

| 文件 | 不动原因 |
|------|---------|
| `app/api/resumes/[id]/reparse/route.ts` | 沿用现有门禁(`textQualityScore < 40 \|\| textLength < 50 \|\| isGarbled`),OCR 通过后 finalText 长度 > 50 + isGarbled=false → 门禁通过 |
| `app/api/resumes/[id]/refetch/route.ts` | 同上 |
| `app/api/resumes/batch-reparse/route.ts` | 同上 |
| `lib/services/parsing-worker-processor.ts` | 同上 |
| `lib/services/ocr-engine.ts` | OCR 引擎本体不动 |
| `lib/services/cleanText`(resume-parser.ts:237) | 现有规则不覆盖此场景,新规则在 PDF 提取层就拦了,无需改 |
| `prisma/schema.prisma` | 不新增字段 |
| `scripts/full-mailbox-sync.ts` | 沿用现有 warnings 消费 |

---

## 五、复用已有能力

- OCR 引擎:`lib/services/ocr-engine.ts`(Tesseract.js + chi_sim,系统已训练中文)
- 视觉 AI:`lib/services/vision-ocr.ts`(AI Vision OCR)
- 重解析入口:`POST /api/resumes/[id]/reparse`(前端已挂按钮)
- 批量重解析:`POST /api/resumes/batch-reparse`(前端已挂批量按钮)
- 现有 `analyzeTextQuality` 的 6 项检测逻辑 — **完全不删不重构**

---

## 六、历史脏数据回填流程

### 6.1 闭环路径(预期成功)

```
用户操作:点击"重新解析"按钮
   ↓
POST /api/resumes/[id]/reparse { force: true }
   ↓
route.ts:68  parseResume(localFilePath, 'pdf')
   ↓
resume-parser.ts:47  extractTextByVisualOrder(buffer, { includeStats: true })
   ↓
pdf-visual-extractor.ts 主循环统计 stats
   ↓
返回 { text: 脏文本, stats: { total: 144, empty: 57, singleChar: ~68, emptyItemRatio: 0.404, singleCharItemRatio: 0.482, ... } }
   ↓
resume-parser.ts:74  analyzeTextQuality(脏文本, stats)
   ↓
computeFragmentationResult(stats)
   → emptyItemRatio=0.404 > 0.30 且 singleCharItemRatio=0.482 > 0.40（AND 组合）→ hardGarbled=true
   ↓
isGarbled = true(硬短路命中)
   ↓
resume-parser.ts:81  进入 OCR cascade
   ↓
ocrPdfPages → 返回 ocrText(完整中文)
   ↓
ocrText.trim().length >= 20 && ocrConfidence >= 0.5
   → parseMethod = 'ocr', finalText = ocrText
   ↓
resume-parser.ts:213  analyzeTextQuality(finalText) ← 单参数,新检查 skip
   → isGarbled=false
   ↓
reparse/route.ts:75  门禁通过 → 更新 DB
   ↓
extractedText = 完整中文, parseMethod = 'ocr', status = 'PENDING' ✓
```

### 6.2 潜在卡点

| 卡点 | 触发条件 | 系统行为 | 对策 |
|------|---------|---------|------|
| OCR 引擎未配置/未训练中文 | OCR confidence < 0.5 | 落到 visionOcrPdf | 验收前先确认容器内 tesseract 可用(见 §6.4) |
| visionOcr 未配置 API key | `msg.includes('未配置')` 命中 | 落到最终 fallback,符合预期 | 无 |
| **OCR + Vision 全失败,fallback 到原始脏文本** | 原始文本 ≥ 30 字符(周艳如 224 字符会命中!) | **原行为(缺陷):脏文本绕过破碎检测入库,status=PENDING** | §4.4 已修复:`sourceTextBroken=true` 时拒绝 fallback,throw → status=ERROR |
| visionOcr 失败 + 原始文本 < 30 字符 | 双重兜底都失败 | throw Error → 500 → status=ERROR | 无 |
| parseResume 抛异常 | 任意步骤崩溃 | reparse route.ts catch → 500,不影响 DB 状态 | 无 |

**确认**:周艳如案例是"扫描 + OCR 输出"PDF,系统已有 chi_sim.traineddata,Tesseract 应该能跑出中文。**预期**:reparse 后 `parseMethod='ocr'`,`extractedText` 是完整中文。

### 6.3 回填数据范围

数据库中所有 `parseMethod='text' AND isGarbled=false` 但实际是破碎 PDF 的记录。

**不写自动批量回填脚本**——用户通过前端"重新解析"按钮触发,或管理员批量调 `POST /api/resumes/[id]/reparse`。

### 6.4 OCR 引擎容器可用性预检(验收前置)

**已修复(2026-08)**:tesseract.js v7 的 createWorker 若显式传 `workerPath: undefined`,会**覆盖 Node 环境默认的本地 worker-script 路径**,导致 `spawnWorker` 直接 `new Worker(undefined)` 崩溃:
`The "filename" argument must be of type string or an instance of URL. Received undefined`
→ 两个 OCR 兜底(`ocrPdfPages` / `visionOcrPdf`)全部失效,破碎 PDF 无法恢复。

**修复**:`ocr-engine.ts` 与 `vision-ocr.ts` 的 createWorker 配置改为**全部指向本地资源**(不依赖 CDN):

```typescript
const tessCorePath = process.cwd() + '/node_modules/tesseract.js-core'  // wasm 引擎(本地)
const tessLangPath = process.cwd()                                      // 语言包目录(项目根)
const worker = await createWorker('chi_sim+eng', OEM.LSTM_ONLY, {
  logger: ...,
  langPath: tessLangPath,   // chi_sim.traineddata / eng.traineddata 在项目根,已 git 跟踪
  corePath: tessCorePath,
  gzip: false,              // 本地语言包未压缩(无 .gz 后缀),必须关闭 gzip 查找
  // workerPath 不传:Node 默认使用本地 worker-script
})
```

**验收前必须验证**:在容器内跑一次 `ocrPdfPages` 或重解析一份已知 PDF,确认 OCR 实际可用;否则 §7.1 的"`parseMethod='ocr'`"预期不成立,会落到"sourceTextBroken → throw → ERROR"分支。

**已知限制**:周艳如 PDF 的部分字形在 pdfjs 渲染层就缺失(字体子集无 glyph),OCR 也无法恢复姓名/学校/公司名等内容——这是 PDF 本身的缺陷,任何提取方式(直接/OCR/vision)均无法完全恢复。

---

## 七、验收测试步骤

### 7.1 阳性用例(预期被检测为破碎并走 OCR)

**前置:先按 §6.4 验证容器内 OCR 可用**。文件:`data/uploads/cmsg2tgaz005d4wf5ynzp89bg/【跨境财税咨询顾问_广州_10-15K】周艳如_17年.pdf`

操作:
```bash
./dev.sh start
curl -X POST http://localhost:3001/api/resumes/cmsg2tgaz005d4wf5ynzp89bg/reparse \
  -H "Content-Type: application/json" -d '{"force": true}'
```

预期结果(查 DB):
- `parseMethod` 从 `'text'` 变为 `'ocr'` 或 `'vision'`
- `isGarbled = false`
- `extractedText` 长度从 224 增至 ≥ 500
- `extractedText` 含完整"周艳如"、"广州华南师范大学"、"经济与贸易"、"广州市百宝仓仓储服务有限公司"、"客服专员"、"广州市灏益通讯科技有限公司"、"电话销售"等
- `errorMessage` 包含"文本层破碎检测命中..."(该 warning 由 §4.4 在破碎命中时 push)
- **若 OCR/Vision 均不可用**:预期 `status=ERROR`(§4.4 的 sourceTextBroken 保护生效),而不是静默入库脏文本

### 7.2 阴性用例(预期不被误伤)

文件:`data/uploads/cmqentb760001xs3bvkcjr6os/【跨境财税规划助理_广州_10-15K】董琳琳_2年.pdf`

操作同上,查 DB:
- `parseMethod = 'text'`(保持不变)
- `isGarbled = false`
- `extractedText` 与重解析前差异 < 5%
- `errorMessage` **不包含**"文字层破碎检测..."

### 7.3 边界用例

| 用例 | 预期 |
|------|------|
| 一页极简英文 PDF(`totalItems < 24`) | 新规则 skip,`isGarbled=false`,走纯文本路径 |
| 正常中文 PDF 含合理空 Tj(行间距用) | 不触发破碎检测(`emptyRatio` 应 < 0.30) |
| **多页 PDF 仅 1 页破碎**(如 5 页中第 3 页空 item 80%) | **必须触发**(`maxPageEmptyRatio=0.80 > 0.30` 命中)——验证 §4.2 按页归并生效,不被跨页稀释 |
| **英文简历(Word/Excel 等单词被拆成单字母 item)** | 按 §3.4 摸底后验证 `singleCharRatio` 不误伤;若误伤,按 §3.1 拆分空格/单字口径 |
| **OCR 结果只有 45 字符的短简历** | 破碎检测通过,但 reparse 门禁 `textLength < 50` 仍 422 打回 ERROR——需人工确认该简历内容 |

### 7.4 编译与回归

```bash
./dev.sh npx tsc --noEmit    # 0 error
./dev.sh npm run lint        # 0 error(允许 warning)
```

### 7.5 回滚预案

```bash
git revert <commit-hash>    # 单 commit 一次性回滚
```

回滚后:所有简历走旧路径,周艳如案例重新出现内容残缺,但**不会更糟**(因为新规则不写库、不破坏既有数据)。

---

## 八、监控

部署后建议观察(1-2 周):
- `parseMethod = 'ocr'` 比例(预期小幅上升,5% 以内为正常)
- `errorMessage` 含"文字层破碎"的记录数
- 周艳如案例 reparse 后 `parseMethod='ocr'`、`textQualityScore >= 60`
- **队列拥堵**:OCR 每页 3-10 秒、队列并发=1,若批量重解析大量破碎简历会长时间阻塞后续简历——建议监控队列深度,必要时分批执行
- **OCR 文本质量抽查**:抽 5-10 份 OCR 结果人工比对,确认错别字率可接受(OCR 文本完整但可能有错字,影响 AI 筛选质量——这是"完整但可能错字" vs "残缺但准确"的取舍)

如阈值需要调整:单独 PR 改 `FRAGMENTATION` 常量即可,不影响接口。

---

## 九、实施顺序(单 PR 可发布)

1. PR #1(原子提交):本章 §4 全部改动一次性提交
2. 部署:开发环境先验证 → 测试用例 7.1-7.3 → 生产灰度
3. 监控:观察 `parseMethod='ocr'` 比例、`errorMessage` 含"文字层破碎"的记录数
4. 阈值调整:如需,单独 PR 改 `FRAGMENTATION` 常量

---

## 十、已知取舍与开放问题

### 10.1 取舍

| 取舍 | 说明 |
|------|------|
| OCR 完整但有错字 vs 残缺但准确 | 破碎 PDF 的原始文本残缺,OCR 文本完整但可能有错别字(如"周艳如"被识别成音近字),影响 AI 筛选与姓名匹配。本方案选择"完整优先",错字由后续 AI 结构化提取环节容错 |
| 空格 item 计入 empty | 信号更敏感(破碎 PDF 字符间空格是强特征),但有误伤正常英文 PDF 的风险,需 §3.4 摸底验证,必要时拆分口径 |
| 破碎 PDF 拒绝静默兜底 | 破碎 PDF 的 OCR 兜底失败时强制 ERROR(§4.4),牺牲"至少有点内容",换取"不让脏数据假扮成功" |

### 10.2 开放问题

1. 阈值是否需要做成可配置(写入 `.env`)?目前硬编码 `FRAGMENTATION` 常量,后续看监控再调
2. OCR 结果是否需要人工复核流程(如错字率 > 阈值时标记人工检查)?目前无
3. `fallbackText ≥ 30 字符` 才兜底的现有逻辑,在新规则下只对"非破碎"的 PDF 生效——破碎 PDF 取"强制 ERROR"而非静默回退(§4.4)

### 10.3 与现有边界条件的已知冲突

| 边界 | 冲突 |
|------|------|
| reparse 门禁 `textLength < 50` | OCR 输出只有 45 字符的短简历即使破碎检测通过,仍会被 422 打回 ERROR——需人工确认该简历是否有内容 |
| OCR `maxPages=10` | 超 10 页的简历 OCR 不完整,破碎检测触发后仍只能提取前 10 页(周艳如 1 页无影响,长简历要注意) |
| 被 `isNoiseItem` 过滤的泄漏串 item 不计入 totalItems | 泄漏串多的 PDF 比例计算有微小偏差(泄漏串 item 既不进 total 也不进 empty/singleChar),影响 < 5%,可接受 |
