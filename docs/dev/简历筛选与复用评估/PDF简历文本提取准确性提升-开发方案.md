# PDF 简历文本提取准确性提升 — 开发方案

> 本方案解决 `pdf-parse` 提取复杂排版简历时出现的顺序错乱、布局丢失、噪音字符问题。
> 三阶段渐进式实施，前一阶段不破坏后一阶段，每阶段独立可发布、可回滚。

---

## 一、Context

### 1.1 现状

`lib/services/resume-parser.ts` 的 `parseResume` 用 `pdf-parse` 做 PDF 文本提取（DOCX 用 `mammoth`），提取结果写入 `Resume.extractedText`。`extractedText` 会被后续流程消费：

- AI 筛选：`ai-screener.ts:81` → `loadAndAssemblePrompt(positionId, resume.extractedText)` → 替换 `{{resumeText}}` 占位符
- 结构化提取：`resume-data-extractor.ts` → AI 把文本转 JSON
- 详情页"提取文本"卡片展示：`app/resume/detail/[id]/page.tsx:885`

`pdf-parse` 上次发布 2021 年（基于 `pdfjs-dist` 1.x），存在两个固有局限：

1. **按 PDF 内容流（content stream）顺序提取，不保留视觉布局** — 单列 PDF 问题不大，多区块、带 banner 的简历会乱序
2. **字体子集处理不完善，会泄漏元数据** — PDF 嵌入字体子集标识符会被当作文本提取出来

### 1.2 实际样本对比（用户提供）

视觉上正确的 PDF：

```
[顶部]  个人简历  ← 蓝色 banner
[基本信息区]  姓名：周思远  性别：男 ...   电话：13143387788
[教育背景]  ← 蓝色 banner
  2022.09-2026.06  金陵科技学院  土木工程专业  本科
  主修课程：...
[实习经历]  ← 蓝色 banner
  2025.07-2025.08  哈尔滨久金商贸有限公司  实习
  ...
[个人荣誉]  ← 蓝色 banner
[技能证书]  ← 蓝色 banner
[自我评价]  ← 蓝色 banner
```

`pdf-parse` 实际产出（截取）：

```
PERSONALRESUME                          ← 来自 PDF 右上角英文装饰标题
相信自己，实现自我价值
 2022.09-2026.06金陵科技学院土木工程专业本科     ← 教育背景内容
 ...
 2025.07-2025.08哈尔滨久金商贸有限公司实习      ← 实习经历内容
 ...
 姓名：周思远                              ← 基本信息（位置错乱）
 性别：男
 ...
 邮箱：1628814391@qq.com
个人简历                                    ← banner 标题被孤立
 2023.09-2026.06班级文体委员职位            ← 个人荣誉内容
 ...
个人荣誉                                    ← banner 标题
技能证书                                    ← banner 标题
自我评价                                    ← banner 标题
8eb89af1691400c61HN739q1EVdTx4y-UfqdWOGglvHXMhlm2Q~~  ← 字体子集标识符（重复 5 次）
8eb89af1691400c61HN739q1EVdTx4y-UfqdWOGglvHXMhlm2Q~~
8eb89af1691400c61HN739q1EVdTx4y-UfqdWOGglvHXMhlm2Q~~
8eb89af1691400c61HN739q1EVdTx4y-UfqdWOGglvHXMhlm2Q~~
8eb89af1691400c61HN739q1EVdTx4y-UfqdWOGglvHXMhlm2Q~~
```

### 1.3 四类具体问题

| # | 问题 | 严重性 | 根因 |
|---|------|-------|------|
| 1 | **区块顺序错乱**（教育背景在基本信息前面） | 高 | pdf-parse 按内容流顺序抽，不按视觉阅读顺序 |
| 2 | **蓝色 banner 区块标题孤立或丢失**（"基本信息"4 个字整体丢失） | 高 | banner 文本与上下区块在内容流里被分隔，视觉聚合被破坏 |
| 3 | **末尾重复 base62 字符串 + `~~`** | 中 | PDF 嵌入字体子集标识符被当作文本提取（`pdf-parse` 已知 bug） |
| 4 | **项目符号变方块**（■、▸、✓ 显示为 PUA 字符） | 低 | PDF 项目符号字体未嵌入，pdf-parse 把 glyph code 映射到 PUA 区 |

### 1.4 现有质量门禁为何没拦住

`analyzeTextQuality`（`lib/services/text-quality-detector.ts`）5 项加权打分（可识别字符比率 0.40、CID 0.20、PUA 0.15、文本密度 0.15、重复模式 0.10）。本样本字数够多、中文占主导 → 综合分 > 40 阈值 → 不触发 OCR 回退。

**关键判断**：质量检测是滞后指标，能识别"提取出的文本像不像文本"，但识别不了"提取出的文本顺序对不对"。布局问题必须从源头解决，不能靠门禁后置发现。

### 1.5 目标

- 不改数据库 schema
- 不引入 AI 调用（零 token 成本）
- 不破坏现有质量门禁和 OCR 回退链路
- 渐进式实施，每阶段独立可回滚

---

## 二、总体方案

三阶段渐进，前阶段为后阶段铺路、且不破坏前阶段：

```
阶段 1（半天）                阶段 2（1-2 天）              阶段 3（可选，未来）
cleanText 增强清洗        +   视觉排序提取器                完全废弃 pdf-parse
                                                       
清洗已知噪音模式              按 Y/X 坐标重排文本             全部走 pdfjs-dist 4.x
└─ 消除样本尾部 5 行重复      └─ 解决顺序错乱 + banner 丢失      └─ 统一技术栈
   字符串 + PUA 字符             ├─ 默认仍走 pdf-parse
                                  └─ 启发式信号触发视觉路径
```

阶段 1 和阶段 2 完全独立，可单独发布。

### 设计原则

1. **确定性逻辑禁止交给模型**（CLAUDE.md） — 坐标排序 = 显式规则算法，触发条件 = 显式阈值判断，不调 AI
2. **快速路径优先** — 单列简单 PDF 仍走 pdf-parse（快路径），只有启发式信号命中才走视觉路径
3. **回退链路保留** — 视觉路径失败时回退到 pdf-parse 原结果，不破坏现有 3 级回退（pdf-parse → OCR → 视觉 AI）

---

## 三、阶段 1：cleanText 增强

### 3.1 目标

消除已知噪音模式，让"pdf-parse 提取出来的文本"在视觉上看更干净。本阶段**不解决顺序错乱**。

### 3.2 新增清洗规则

在 `lib/services/resume-parser.ts:238` 的 `cleanText` 函数中新增以下步骤（顺序：先压缩噪音 → 再做现有归一化）：

#### 规则 A：移除字体子集标识符残留

```typescript
// 匹配: 40-60 字符的 base62 字符串 + ~~ 后缀（pdf-parse 的字体子集泄漏特征）
// 例: 8eb89af1691400c61HN739q1EVdTx4y-UfqdWOGglvHXMhlm2Q~~
const fontSubsetPattern = /[A-Za-z0-9-]{40,60}~~/g
text = text.replace(fontSubsetPattern, '')
```

注意：必须限制字符集（排除空格、换行）和长度，避免误删正文。

#### 规则 B：移除 PUA 字符（Unicode 私有使用区）

```typescript
// U+E000-U+F8FF 是 Unicode 私有使用区
// pdf-parse 把未能识别的 glyph 映射到此处
const puaPattern = /[-]/g
text = text.replace(puaPattern, '')
```

注意：**不要清 U+FFFD**（替换字符），那是文本编码异常的信号，应保留以便质量检测发现。

#### 规则 C：项目符号归一化（可选，影响小）

```typescript
// 把常见 Unicode 项目符号统一为 "· "
// 仅在连续出现且明显是列表标记时替换
const bulletPattern = /^[\s]*[•●○▪▫■□◆◇★☆►▻▼▲◀▶]+\s*/gm
text = text.replace(bulletPattern, '· ')
```

**建议先不实现规则 C**——它可能误伤正文里真实存在的项目符号，且对 AI 结构化提取无实质影响。如阶段 2 完成后仍有视觉混乱再补。

### 3.3 完整 cleanText 实现骨架

```typescript
function cleanText(text: string): string {
  return text
    // === 新增：噪音字符清除 ===
    .replace(/[A-Za-z0-9-]{40,60}~~/g, '')           // A: 字体子集标识符
    .replace(/[-]/g, '')                  // B: PUA 区字符
    // === 现有逻辑保留 ===
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\(cid:\d+\)/g, ' ')
    .normalize('NFC')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim()
}
```

### 3.4 改动点

仅修改 `lib/services/resume-parser.ts` 的 `cleanText` 函数。**不修改**：
- `parseResume` 主流程
- 质量检测（阶段 1 不修改打分规则）
- 数据库 schema
- 任何调用方

### 3.5 验收

- 用户提供的样本：尾部 5 行 `8eb89af1691400c61HN739q1EVdTx4y-UfqdWOGglvHXMhlm2Q~~` 全部消失
- 用户提供的样本：所有 `` 类方块字符消失（或显著减少）
- 简单单列 PDF 提取结果不变（回归测试）
- `analyzeTextQuality` 对清洗后文本的打分应略高于清洗前（因为 PUA 字符减少）

---

## 四、阶段 2：pdfjs-dist 视觉排序提取器

### 4.1 目标

当启发式信号命中时，按 PDF **视觉阅读顺序**重排文本，从源头解决"顺序错乱 + banner 标题丢失"问题。

### 4.2 核心算法

```
对每一页：
  1. pdfjs-dist getTextContent() 拿到所有 text item
  2. 每个 item 含: str, transform[4]=x, transform[5]=y, width, height
  3. 按 Y 坐标聚类成"行"：相邻 item 的 Y 坐标差值 ≤ maxHeight/2 视为同一行
  4. 每行内按 X 坐标升序
  5. 行间按 Y 坐标降序（PDF 坐标系 Y 轴向上增长，视觉上是自上而下）
  6. 行间用换行符拼接
跨页：
  7. 页间用 \n\n 拼接（保持页码分隔感）
```

#### 算法细节

```typescript
// 伪代码（lib/services/pdf-visual-extractor.ts）
async function extractTextByVisualOrder(buffer: Buffer): Promise<string> {
  const pdf = await pdfjs.getDocument({ data: buffer }).promise
  const lines: string[] = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()

    // 1. 转成带坐标的项
    const items = content.items.map(item => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      h: item.height || item.transform[3] || 10,  // 字体高度
    })).filter(it => it.str.trim().length > 0)

    if (items.length === 0) continue

    // 2. 按 Y 分组（Y 坐标相近 = 同一行）
    const sorted = [...items].sort((a, b) => b.y - a.y)  // Y 降序（视觉自上而下）
    const rows: Array<typeof items> = []
    let currentRow: typeof items = [sorted[0]]
    let currentY = sorted[0].y

    for (let i = 1; i < sorted.length; i++) {
      const it = sorted[i]
      const tol = Math.max(currentRow[0].h, it.h) / 2
      if (Math.abs(currentY - it.y) <= tol) {
        currentRow.push(it)  // 同一行
      } else {
        rows.push(currentRow.sort((a, b) => a.x - b.x))  // 行内按 X 升序
        currentRow = [it]
        currentY = it.y
      }
    }
    rows.push(currentRow.sort((a, b) => a.x - b.x))

    // 3. 行转字符串
    const pageText = rows
      .map(row => row.map(it => it.str).join(''))
      .join('\n')
    lines.push(pageText)
  }

  return lines.join('\n\n')
}
```

#### 算法限制与已知问题

| 场景 | 表现 | 处理 |
|------|------|------|
| 单栏（左右连续） | 完美 | 默认 |
| 双栏（左右独立区块） | 左右列会按 Y 交错合并 | **需要后续做列检测**（Y 坐标相近但 X 坐标差距 > 阈值时识别为双栏，按"先左列全部、再右列全部"输出）。本阶段暂不实现，遇到双栏简历用质量检测兜底触发 OCR 回退 |
| 多行段落 | Y 聚类时相邻行间距可能 ≤ 容差，错误合并 | 容差取 max(行内最大高度)/2，常见简历够用 |
| 跨行断字（"自我评\n价"） | 断开显示 | 不处理，沿用 PDF 原样 |
| 旋转文字 | transform[0..3] 含旋转矩阵 | 本阶段不处理，超出范围 |

### 4.3 新增文件

#### `lib/services/pdf-visual-extractor.ts`（新）

```typescript
export interface VisualExtractOptions {
  maxPages?: number         // 默认 10（与 ocr-engine 一致）
  onProgress?: (page: number, total: number) => void
}

export async function extractTextByVisualOrder(
  buffer: Buffer,
  options?: VisualExtractOptions
): Promise<string>
```

**注意 polyfill**：`pdfjs-dist` v4 需要 `process.getBuiltinModule`，开发环境 webpack 注入、生产环境 `instrumentation.ts` 注入（CLAUDE.md 已说明）。**复用 `ocr-engine.ts` 现有的 polyfill 链路，不要重新实现**——直接 import 同一份 lib。

#### 复用现有依赖

- `pdfjs-dist` v4：已在 `ocr-engine.ts` 中使用
- `node-require` 模式（`createRequire(process.cwd() + '/package.json')`）：参考 `resume-parser.ts:8`
- 不需要新增 npm 依赖

#### 关闭 pdfjs-dist verbose 日志

`pdfjs-dist` v4 默认会输出 verbose 日志（WASM 编译、worker 加载、字体加载等），视觉路径频繁触发会污染生产 console。在 `pdf-visual-extractor.ts` 顶部加载 `pdfjs-dist` 后立即关闭：

```typescript
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

// 关闭 pdfjs-dist 默认 verbose 日志（生产环境必须）
// pdfjs Verbosity: 0=errors, 1=warnings, 2=infos (default), 3=logs
;(pdfjs as any).Verbosity = 0

// 服务端不需要 worker，避免不必要的 worker 加载日志
;(pdfjs as any).GlobalWorkerOptions.workerSrc = false
```

### 4.4 parseResume 集成

#### 关键约束（实现前必读）

1. **仅 PDF 启用**：`fileType === 'pdf'` 才进入视觉路径判断；DOCX 用 mammoth 按结构提取，本身就有顺序，跳过整个 4.4 改造逻辑直接走 Step 1 的 mammoth 分支。
2. **动态 import**：用 `await import('./pdf-visual-extractor')`，与 `ocr-engine.ts:88` 和 `vision-ocr.ts:125` 一致，HMR 友好。
3. **产物命名**：视觉路径产出叫 `orderedText`（不是 `text2` 或 `visualText`），避免和现有 `visionText`（来自 `vision-ocr.ts:123-138`）混淆。

#### 完整时序（替换原 Step 1）

```
Step 1 改造（仅 fileType === 'pdf' 时执行）:
  1a. pdf-parse 提取 → text1                                  [现有]
  1b. analyzeTextQuality(text1) → report1                     [现位于 Step 2]
      · report1 提供: score / isGarbled / checks / hasFontSubsetLeakage
      · 注意：必须在 cleanText 之前调用，否则字体子集字符串已被移除
  1c. shouldUseVisual = fileType === 'pdf' && ENABLE_VISUAL_EXTRACTOR
                       && (report1.hasFontSubsetLeakage
                           || report1.checks.find(c => c.name === 'pua')?.score < PUA_SCORE_THRESHOLD)
  1d. 若 shouldUseVisual:
        const start = Date.now()
        const { extractTextByVisualOrder } = await import('./pdf-visual-extractor')
        let orderedText = ''
        try {
          orderedText = await extractTextByVisualOrder(buffer, { maxPages: 10 })
        } catch (err) {
          warnings.push(`视觉排序失败，已回退到 pdf-parse: ${err.message}`)
        }
        // 校验 orderedText 有效性（必须非空且不短于 text1 的 80%）
        const valid = orderedText.trim().length > 0
                    && orderedText.length >= text1.length * 0.8
        const elapsedMs = Date.now() - start
        if (valid) {
          text = orderedText
          warnings.push(`使用视觉排序路径（puaScore=${...}, hasFontSubset=${report1.hasFontSubsetLeakage}, took=${elapsedMs}ms）`)
          console.log(`[ParseResume] visual-extractor triggered: resumeId=${options?.resumeId}, puaScore=${...}, hasFontSubset=${report1.hasFontSubsetLeakage}, took=${elapsedMs}ms`)
        } else {
          text = text1
          warnings.push(`视觉排序结果无效（len=${orderedText.length}），回退到 pdf-parse`)
        }
  1e. 否则: text = text1
  1f. 重新 analyzeTextQuality(text) → report2                  [原 Step 2 移到此处]
      · 用视觉路径后的最终 text 评估，作为后续质量门禁和 OCR 回退依据
Step 2 起（OCR / Vision / 降级）: 完全不动，沿用现有逻辑
```

#### 实现要点

- `analyzeTextQuality` 当前位置在 `parseResume:69`（提取后立即调用）。改造时把它的两次调用拆开：
  - 第一次（1b）紧跟 `parsePdf` 之后，用于启发式判断
  - 第二次（1f）在视觉路径覆盖 text 之后，用于最终质量评估
- 视觉路径的 buffer 必须是原始 PDF buffer（parsePdf 之前的 buffer），不是 text1
- `ENABLE_VISUAL_EXTRACTOR` 环境变量读取放 `parseResume` 顶部，默认 `true`，置 `false` 时跳过整个 4.4 改造（紧急回滚用）
- 阈值常量放 `parseResume` 函数顶部集中定义：
  ```typescript
  const VISUAL_EXTRACTOR_PUA_SCORE_THRESHOLD = 60  // PUA 检测项得分 < 60 触发
  const VISUAL_EXTRACTOR_MIN_TEXT_RATIO = 0.8     // 视觉结果必须不短于 pdf-parse 的 80%
  const VISUAL_EXTRACTOR_DEFAULT_MAX_PAGES = 10   // 与 ocr-engine 默认值一致
  ```
- `hasFontSubsetLeakage` 字段在 `text-quality-detector.ts` 的 `analyzeTextQuality` 内部检测：
  ```typescript
  const fontSubsetMatches = text.match(/[A-Za-z0-9-]{40,60}~~/g) || []
  const hasFontSubsetLeakage = fontSubsetMatches.length > 0
  ```
  作为独立字段挂到 `TextQualityReport` 上，方便 `parseResume` 直接读 bool（不必遍历 checks 数组）。同时把它也作为一项写入 `checks` 数组，保持报告完整性。

### 4.5 启发式触发条件

满足**任一**条件即触发视觉路径：

| 信号 | 阈值 | 检测位置 | 理由 |
|------|------|---------|------|
| PUA 字符占比 | > 1% | `analyzeTextQuality` 检测项 3 | PUA 是字体未嵌入的强信号，伴随布局错乱概率高 |
| 字体子集标识符残留 | 至少 1 处匹配 `fontSubsetPattern` | 新增检测（cleanText 之前） | 直接证据 pdf-parse 输出有问题 |
| 检测项 1（可识别字符比率） | 得分 < 75（满分 100） | `analyzeTextQuality` | 整体可疑，但 PUA 已涵盖大部分情况 |

实现方式：扩展 `TextQualityReport` 新增字段 `hasFontSubsetLeakage: boolean`（在 `text-quality-detector.ts` 中检测），`parseResume` 读这个字段判断。

### 4.6 新增 warnings

视觉路径使用时，往 `warnings` 数组追加：

- `使用视觉排序路径（原 pdf-parse 文本可能顺序错乱）`
- 失败时：`视觉排序失败，已回退到 pdf-parse: {err.message}`

### 4.7 验收

- 用户提供的样本：文本顺序与 PDF 视觉顺序一致（基本信息 → 教育背景 → 实习经历 → 个人荣誉 → 技能证书 → 自我评价）
- 用户提供的样本：所有蓝色 banner 标题正确出现在对应区块开头
- 用户提供的样本：尾部 5 行字体子集字符串消失
- 简单单列 PDF（无 banner、无图片装饰）仍走 pdf-parse 路径，不引入额外开销
- 视觉路径在原 OCR 回退链路中位置正确（pdf-parse → 视觉提取 → OCR → AI 视觉）

---

## 五、阶段 3（可选，未来评估）

完全废弃 `pdf-parse`，所有 PDF 走 `pdfjs-dist` v4 视觉路径。需要在更多真实样本上验证：
- 双栏简历的列检测正确性
- 多页简历的页间连续性
- 性能开销（视觉路径比 pdf-parse 慢 2-5 倍）

**不在本方案范围**。仅作为阶段 2 成熟后的备选方向。

---

## 六、验收标准与测试用例

### 6.1 测试样本（需准备）

| 编号 | 类型 | 说明 | 期望路径 |
|------|------|------|---------|
| T1 | 单列简单 | 1 页纯文字，无装饰 | pdf-parse（无启发式命中） |
| T2 | 单列带 banner | 用户提供的样本 | pdf-parse → 视觉路径 |
| T3 | 双栏简历 | 左右分栏（如英文简历） | pdf-parse → 视觉路径（可能仍乱，回退 OCR） |
| T4 | 有照片 | 简历含照片 | pdf-parse（不影响，照片步骤独立） |
| T5 | 扫描型 PDF | 无文本层 | 现有 OCR 链路（不属本方案范围） |

### 6.2 验收指标

| 指标 | 阶段 1 后 | 阶段 2 后 |
|------|----------|----------|
| T1 文本字数变化 | 0（无噪音） | 0 |
| T2 尾部字体子集字符串 | 消失 | 消失 |
| T2 视觉顺序正确率（人工核对前 3 个区块标题） | 不变 | 100% |
| T2 banner 标题完整出现 | 部分 | 全部 |
| T1/T5 提取时间 | 不变 | T1 不变，T5 不变 |
| T2 提取时间 | 不变 | +200~500ms（视觉路径开销） |

### 6.3 自动化测试

无现有单元测试体系（CLAUDE.md 已说明）。验收通过 **Playwright MCP 端到端**：

1. 用 T2 样本触发"重新解析"
2. 在详情页对比 `extractedText` 与 PDF 视觉内容
3. 截图记录前后对比

测试文件存 `.playwright-mcp/`，文件名格式 `pdf-extract-accuracy-{phase}-{sample}.png`。

---

## 七、风险与回滚

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 阶段 1 正则误删正文（40-60 字符 base62 + `~~`） | 低 | 中 | 正则限制字符集和长度；先在样本 T1/T2 上验证；如有问题用更严的字符集约束（如必须含数字+小写字母混合） |
| 阶段 2 启发式阈值过严，漏触发 | 中 | 中 | 初始阈值保守（PUA>1%、fontSubset 检测），跑一周生产数据观察；通过 `parseMethod='visual'` 标记的比例监控 |
| 阶段 2 启发式阈值过松，简单 PDF 走慢路径 | 中 | 低 | 简单 PDF 视觉路径也只需 200-500ms，无功能影响 |
| 阶段 2 视觉路径对双栏简历错误合并左右列 | 高 | 中 | 双栏样本落回现有质量门禁检测 → OCR 回退；阶段 3 再做列检测 |
| `pdfjs-dist` v4 与 `pdf-parse` 共存导致 bundle 增大 | 中 | 低 | pdfjs-dist 已在 ocr-engine 中使用，无新增 bundle 开销 |

### 回滚方案

阶段 1：git revert `cleanText` 的 3 行新增。

阶段 2：通过 feature flag 控制（新增环境变量 `ENABLE_VISUAL_EXTRACTOR`，默认 `true`；置 `false` 时跳过视觉路径，直接走 pdf-parse）。即使代码 bug 也可瞬间关闭。

---

## 八、关键文件清单

| 文件 | 操作 | 阶段 |
|------|------|------|
| `lib/services/resume-parser.ts` | 修改（cleanText + Step 1 改造） | 1 + 2 |
| `lib/services/text-quality-detector.ts` | 修改（新增 `hasFontSubsetLeakage` 字段） | 2 |
| `lib/services/pdf-visual-extractor.ts` | 新增 | 2 |

无 schema 变更、无前端变更、无 API 路由变更、无新依赖。

---

## 九、实施步骤

### 阶段 1（约 0.5 天）

1. 在 `cleanText` 中新增规则 A、B
2. 用样本 T2 验证尾部字符串消失
3. 用样本 T1 验证简单 PDF 不受影响
4. 提交、发版、观察

### 阶段 2（约 1.5 天）

#### Day 1
1. 实现 `lib/services/pdf-visual-extractor.ts` 的核心算法（单页 Y 分行 + X 排序 + 跨页拼接）
2. 单元函数测试：用样本 T2 跑一遍，对比提取顺序

#### Day 2
1. 扩展 `text-quality-detector.ts` 添加 `hasFontSubsetLeakage` 检测
2. 改造 `parseResume` Step 1 集成视觉路径 + 启发式触发
3. 添加 feature flag `ENABLE_VISUAL_EXTRACTOR`
4. 端到端测试：用 T1/T2/T4 跑"重新解析"，Playwright 截图对比详情页

#### 后续观察（1 周）
- 监控 `parseMethod='visual'` 占比（应在 5-20% 范围，太多说明启发式过松）
- 收集异常样本，按需调阈值