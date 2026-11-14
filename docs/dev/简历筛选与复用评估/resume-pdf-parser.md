# 简历 PDF 解析功能增强方案

## Context

当前项目使用 `pdf-parse` 进行 PDF 文本提取，存在以下问题：
1. **扫描型 PDF 完全无法处理** — 提取文字不足 10 字符时直接报错 "PDF可能是扫描件"
2. **乱码无冗余处理** — CID 字体、编码异常等导致的乱码文本直接透传，影响后续 AI 筛选质量
3. **无法提取简历照片** — 缺少候选人头像信息
4. **提取信息结构单一** — 仅提取姓名/手机/邮箱，缺少教育、工作经历等结构化数据

本方案将构建一条多层级降级的解析管线，显著提升简历数据的完整性和可用性。

---

## 解析管线总览

```
PDF 文件
  │
  ├─ Step 1: pdf-parse 文本提取（现有）
  ├─ Step 2: 文本质量检测（新增）
  │    ├─ 质量合格 → 使用文本, parseMethod = "text"
  │    └─ 乱码/空白 → Step 3
  ├─ Step 3: 本地 OCR（tesseract.js + mupdf）
  │    ├─ OCR 结果可用 → parseMethod = "ocr"
  │    └─ OCR 不佳 → Step 4
  ├─ Step 4: 多模态 AI 视觉识别（可选，需配置）
  │    └─ parseMethod = "vision"
  ├─ Step 5: 乱码清洗 + 联系信息正则提取（增强现有）
  ├─ Step 6: 照片提取（新增）
  └─ 返回 { text, name, phone, email, photoPath, parseMethod }

         ── 异步后处理（用户触发或自动） ──

  └─ Step 7: AI 结构化数据提取（新增）
       └─ 简历文本 → AI → 结构化 JSON → 数据库
```

---

## 一、新增依赖

| 包名 | 用途 | 说明 |
|------|------|------|
| `tesseract.js` | OCR 引擎 | 纯 JS+WASM，零系统依赖，支持中文(chi_sim) |
| `mupdf` | PDF 页面渲染为图片 | WASM 绑定，无需安装系统级依赖，同时可提取内嵌图片 |
| `sharp` | 图片处理 | 用于 OCR 预处理（灰度/增强对比）和照片缩放归一化 |

`next.config.mjs` 的 `serverExternalPackages` 需新增: `'tesseract.js'`, `'mupdf'`, `'sharp'`

---

## 二、数据库 Schema 变更

### Resume 模型新增字段

```prisma
model Resume {
  // ... 现有字段 ...
  candidatePhoto  String?    // 提取的候选人头像文件路径
  structuredData  String?    // JSON 格式的结构化简历数据
  parseMethod     String?    // 解析方式: "text" | "ocr" | "vision"
}
```

### AIConfig 模型新增字段

```prisma
model AIConfig {
  // ... 现有字段 ...
  purposes  String  @default("screening")  // 逗号分隔的用途标识，多选
}
```

**用途标识 (多选，逗号分隔存储):**
- `screening`: AI 简历筛选（现有行为）
- `extraction`: 结构化数据提取（新增）
- `ocr`: 多模态视觉 OCR 识别（新增，需模型支持图片输入）

**示例值:**
- `"screening"` — 仅用于筛选（现有配置迁移默认值）
- `"screening,extraction"` — 同时用于筛选和结构化提取
- `"ocr"` — 仅用于 OCR 识别
- `"screening,extraction,ocr"` — 全部用途

**查询逻辑:** 使用 SQLite 的 `LIKE '%screening%'` 或在应用层 `purposes.split(',').includes('screening')` 匹配
**默认配置:** `isDefault` 行为不变（标记为全局默认），各用途场景获取配置时按优先级: 指定 configId > isDefault 且包含对应 purpose > 第一个包含对应 purpose 的 active 配置 > 回退到环境变量
**迁移脚本:** 所有现有记录设置 `purposes = "screening"`

---

## 三、新增服务文件

### 3.1 `lib/services/text-quality-detector.ts` (~100 行)

**导出:** `analyzeTextQuality(text: string): TextQualityReport`

```typescript
interface TextQualityReport {
  score: number          // 综合质量评分 0-100
  isGarbled: boolean     // score < 30 判定为乱码
  checks: CheckDetail[]  // 各项检测的详细结果
}

interface CheckDetail {
  name: string           // 检测项名称
  passed: boolean        // 是否通过
  score: number          // 该项得分 0-100
  weight: number         // 权重 (所有权重之和为 1.0)
  detail: string         // 人类可读的说明，如 "CID序列: 发现23处"
}
```

**检测项与评分算法:**

综合评分 = 各检测项 score * weight 加权求和，低于 30 分判定为乱码。

#### 检测项 1: 可识别字符比率（权重 0.40，核心指标）

```typescript
// 定义"可识别字符"集合
const recognizable = /[\u4e00-\u9fff\u3400-\u4dbf]|[a-zA-Z]|[0-9]|[\u3000-\u303f\uff00-\uffef]|[.,;:!?，。；：！？、""''（）【】《》\-—·\s]/g

const recognizableCount = (text.match(recognizable) || []).length
const totalCount = text.length
const ratio = totalCount > 0 ? recognizableCount / totalCount : 0
```

| 比率 | 得分 | 含义 |
|-----|------|------|
| >= 0.85 | 100 | 正常文本 |
| 0.70 - 0.85 | 75 | 轻微异常 |
| 0.50 - 0.70 | 45 | 明显异常 |
| 0.30 - 0.50 | 20 | 严重乱码 |
| < 0.30 | 0 | 几乎不可读 |

**覆盖范围:** 中文基本区+扩展A区、英文、数字、全角字符、中英文标点、空白符。不在此范围的字符（如私有区域字符、CID 映射失败的字符、Latin-1 误解码的字符）被视为不可识别。

#### 检测项 2: CID 字体序列（权重 0.20）

```typescript
const cidPattern = /\(cid:\d+\)/g
const cidMatches = text.match(cidPattern) || []
const cidCount = cidMatches.length
```

| CID 数量 | 得分 | 含义 |
|----------|------|------|
| 0 | 100 | 无 CID 问题 |
| 1-3 | 80 | 极少量，可能是个别特殊字符 |
| 4-10 | 40 | 部分字体嵌入缺失 |
| 11-50 | 15 | 大量 CID，严重乱码 |
| > 50 | 0 | 几乎全部是 CID |

**背景:** pdf-parse 在遇到未嵌入字体映射的 PDF 时，会输出 `(cid:XX)` 格式的原始字符编码，是最常见的 PDF 乱码模式之一。

#### 检测项 3: Unicode 异常字符密度（权重 0.15）

```typescript
// U+FFFD 替换字符 + 私有使用区 + 代理对区残留
const abnormalPattern = /[\uFFFD\uE000-\uF8FF\uD800-\uDFFF]/g
const abnormalCount = (text.match(abnormalPattern) || []).length
const density = text.length > 0 ? abnormalCount / text.length : 0
```

| 密度 | 得分 | 含义 |
|------|------|------|
| < 0.01 | 100 | 正常 |
| 0.01 - 0.05 | 60 | 少量异常字符 |
| 0.05 - 0.15 | 25 | 较多异常字符 |
| >= 0.15 | 0 | 严重编码问题 |

**覆盖:** U+FFFD（解码失败的替换符）、私有使用区 U+E000-U+F8FF（某些 PDF 将自定义字体映射到此区域）、孤立的代理对字符。

#### 检测项 4: 有效文本密度（权重 0.15）

```typescript
// 去除所有空白和控制字符后的文本长度
const strippedText = text.replace(/[\s\x00-\x1f\x7f]/g, '')
const strippedLength = strippedText.length
```

| 去空白长度 | 得分 | 含义 |
|-----------|------|------|
| >= 100 | 100 | 足够的内容量 |
| 50-99 | 70 | 内容偏少但可用 |
| 20-49 | 40 | 内容极少 |
| 10-19 | 15 | 几乎无内容 |
| < 10 | 0 | 无效 |

**用途:** 扫描型 PDF 用 pdf-parse 提取时通常返回少量随机字符或空白，此项能精准识别。

#### 检测项 5: 重复模式检测（权重 0.10）

```typescript
// 检测连续重复字符序列（3+ 次相同字符）
const repetitionPattern = /(.)\1{5,}/g
const repetitions = text.match(repetitionPattern) || []
const repetitionCharCount = repetitions.reduce((sum, m) => sum + m.length, 0)
const repetitionRatio = text.length > 0 ? repetitionCharCount / text.length : 0

// 检测短序列高频重复（如 "□□□□" 或 "aaaa"）
const chunks = text.match(/.{1,3}/g) || []
const chunkFreq = new Map<string, number>()
chunks.forEach(c => chunkFreq.set(c, (chunkFreq.get(c) || 0) + 1))
const maxFreq = Math.max(...chunkFreq.values(), 0)
const dominantRatio = chunks.length > 0 ? maxFreq / chunks.length : 0
```

| 指标 | 得分 | 含义 |
|------|------|------|
| repetitionRatio < 0.05 且 dominantRatio < 0.15 | 100 | 正常 |
| 其中一项轻微超标 | 50 | 有些重复模式 |
| repetitionRatio >= 0.20 或 dominantRatio >= 0.40 | 0 | 大量无意义重复 |

**背景:** 某些乱码 PDF 提取后出现大量 `□□□□` 或 `????` 或相同字符无限重复，正常简历文本不会有此特征。

#### 综合评分示例

**正常简历文本:**
| 检测项 | score | weight | 加权 |
|--------|-------|--------|------|
| 可识别字符比率 (95%) | 100 | 0.40 | 40 |
| CID 序列 (0个) | 100 | 0.20 | 20 |
| Unicode 异常 (0%) | 100 | 0.15 | 15 |
| 有效文本密度 (2000字) | 100 | 0.15 | 15 |
| 重复模式 (正常) | 100 | 0.10 | 10 |
| **综合** | **100** | | **100** |

**CID 乱码 PDF:**
| 检测项 | score | weight | 加权 |
|--------|-------|--------|------|
| 可识别字符比率 (25%) | 0 | 0.40 | 0 |
| CID 序列 (87个) | 0 | 0.20 | 0 |
| Unicode 异常 (2%) | 60 | 0.15 | 9 |
| 有效文本密度 (500字) | 100 | 0.15 | 15 |
| 重复模式 (正常) | 100 | 0.10 | 10 |
| **综合** | | | **34** → 乱码边界 |

**扫描型 PDF (几乎无文字):**
| 检测项 | score | weight | 加权 |
|--------|-------|--------|------|
| 可识别字符比率 (60%) | 45 | 0.40 | 18 |
| CID 序列 (0个) | 100 | 0.20 | 20 |
| Unicode 异常 (0%) | 100 | 0.15 | 15 |
| 有效文本密度 (8字) | 0 | 0.15 | 0 |
| 重复模式 (正常) | 100 | 0.10 | 10 |
| **综合** | | | **63** → 但因文本过短，单独触发 OCR |

**注意:** 即使综合评分 >= 30，若有效文本密度检测项得分 = 0 (去空白后 < 10 字符)，也强制判定为需要 OCR，因为信息量不足以进行有意义的后续处理。这是一个 **硬性短路规则**，独立于加权评分。

### 3.2 `lib/services/ocr-engine.ts` (~120 行)

**导出:**
- `ocrPdfPages(buffer: Buffer, options?: { maxPages?: number }): Promise<{ text: string; confidence: number }>`

流程：
1. `mupdf` 加载 PDF，按页渲染为 300 DPI PNG
2. `sharp` 预处理：灰度化、对比度增强
3. `tesseract.js` 执行 OCR（语言包: `chi_sim+eng`）
4. 拼接各页文本，计算平均置信度
5. 默认最多处理 10 页

Worker 管理：
- 使用 `globalThis` 单例模式（同 `lib/prisma.ts`），开发环境下避免 HMR 重复创建
- 语言数据建议预缓存到 `data/tessdata/` 目录

### 3.3 `lib/services/vision-ocr.ts` (~80 行)

**导出:** `visionOcr(imageBuffers: Buffer[]): Promise<string>`

流程：
1. 查询 `AIConfig` 中 `purposes` 包含 `"ocr"` 且 `isActive = true` 的配置（优先 isDefault）
2. 如无配置，抛出描述性错误："未配置OCR用途的AI模型，请在AI模型配置中添加支持视觉的模型并勾选OCR识别用途"
3. 构造 `image_url` content parts（base64），最多 5 页
4. System prompt: "你是一个OCR文字识别助手。请仔细识别图片中的所有文字，保持原始排版格式，不要添加任何解释。"
5. 调用 `client.chat.completions.create()` 获取文本

### 3.4 `lib/services/pdf-image-extractor.ts` (~100 行)

**导出:**
- `extractPhotosFromPdf(buffer: Buffer): Promise<ExtractedImage[]>`
- `extractPhotosFromDocx(buffer: Buffer): Promise<ExtractedImage[]>`

PDF 照片提取（使用 mupdf）：
1. 遍历页面中的图片对象
2. 筛选条件: 宽高 >= 80px，宽高比 0.5-2.0，面积不超过页面 50%
3. 评分排序: 优先首页右上角区域（中文简历常见头像位置）、尺寸接近 100-400px、接近正方形
4. 返回最佳候选

DOCX 照片提取：
1. mammoth 带自定义 image converter 捕获图片 buffer
2. 同样的尺寸/比例筛选逻辑

照片保存：
- `sharp` 缩放至最大 400x400，转为 JPEG (quality 85)
- 保存到 `data/uploads/{emailId}/{resumeId}_photo.jpg`

### 3.5 `lib/services/resume-data-extractor.ts` (~120 行)

**导出:** `extractStructuredData(resumeId: string, aiConfigId?: string): Promise<StructuredResumeData>`

流程：
1. 获取简历的 `extractedText`
2. 获取 AI 配置：指定 configId > purposes 包含 `"extraction"` 的默认配置 > purposes 包含 `"extraction"` 的第一个 active 配置 > 回退到 purposes 包含 `"screening"` 的配置
3. 使用 `lib/prompts/extraction.ts` 中的提示词
4. 解析 AI 返回的 JSON（复用 `parseAIResponse` 健壮解析模式）
5. `JSON.stringify(result)` 存入 `resume.structuredData`
6. 如 AI 提取的基本信息比现有正则结果更完整，同步更新 candidateName/Phone/Email

### 3.6 `lib/prompts/extraction.ts` (~60 行)

结构化提取的 System/User prompt，指导 AI 输出固定 JSON 格式。

### 3.7 `types/resume.ts` (新增)

```typescript
interface StructuredResumeData {
  basicInfo: {
    name: string | null
    gender: string | null
    birthDate: string | null
    age: number | null
    phone: string | null
    email: string | null
    currentCity: string | null
    hometown: string | null
    politicalStatus: string | null
  }
  education: Array<{
    school: string; major: string; degree: string
    startDate: string | null; endDate: string | null
  }>
  workExperience: Array<{
    company: string; title: string; department: string | null
    startDate: string | null; endDate: string | null
    responsibilities: string
  }>
  projectExperience: Array<{
    name: string; role: string | null
    startDate: string | null; endDate: string | null
    description: string; techStack: string[]
  }>
  skills: string[]
  certificates: string[]
  languages: Array<{ language: string; proficiency: string }>
  selfEvaluation: string | null
  expectedSalary: string | null
  expectedCity: string | null
  expectedPosition: string | null
}
```

---

## 四、修改现有文件

### 4.1 `lib/services/resume-parser.ts` — 核心改造

**ParseResult 接口扩展:**
```typescript
interface ParseResult {
  text: string
  name: string | null
  phone: string | null
  email: string | null
  photoPath: string | null                 // 新增
  parseMethod: 'text' | 'ocr' | 'vision'  // 新增
  warnings: string[]                       // 新增: 管线各步骤产生的警告
  textQualityScore: number                 // 新增: 最终文本质量评分 (0-100)
}
```

**parseResume 签名扩展:**
```typescript
export async function parseResume(
  filePath: string,
  fileType: string,
  options?: { emailId?: string; resumeId?: string }
): Promise<ParseResult>
```

**新流程:**
1. 读取文件 buffer（现有）
2. PDF: `parsePdf(buffer)` 获取文本（现有）
3. `analyzeTextQuality(text)` 检测质量（新增）
4. 质量合格 (score >= 30) → `parseMethod = 'text'`
5. 质量不合格或文本过短:
   - 调用 `ocrPdfPages(buffer)` 进行本地 OCR
   - OCR 置信度 >= 0.5 且文本 >= 20 字符 → `parseMethod = 'ocr'`
   - 否则尝试 `visionOcr()` (需有多模态配置) → `parseMethod = 'vision'`
   - 全部失败 → 抛出改进的错误信息
6. `cleanText()` 增强清洗（见下）
7. `extractContactInfo()` 正则提取（现有）
8. 如提供 options → 尝试照片提取并保存
9. 返回扩展的 ParseResult

**cleanText 增强:**
- 新增: 移除 `(cid:\d+)` 模式
- 新增: `text.normalize('NFC')` Unicode 规范化
- 新增: 移除控制字符 `\x00-\x08`, `\x0B-\x0C`, `\x0E-\x1F`
- 新增: 压缩连续 3+ 相同符号
- 保留现有的空白归一化逻辑

### 4.2 `lib/services/email-fetcher.ts` — 传递新参数

调用 `parseResume` 时传入 options:
```typescript
const parseResult = await parseResume(filePath, fileType, {
  emailId: emailRecord.id,
  resumeId: resume.id,
})
```

resume update 时新增:
```typescript
candidatePhoto: parseResult.photoPath || null,
parseMethod: parseResult.parseMethod,
```

### 4.3 `app/api/resumes/[id]/reparse/route.ts` — 同 4.2

传入 options，保存 photoPath 和 parseMethod。

### 4.4 `app/api/resumes/batch-reparse/route.ts` — 同 4.2

### 4.5 `app/api/resumes/[id]/refetch/route.ts` — 同 4.2

### 4.6 `next.config.mjs` — 新增 serverExternalPackages

### 4.7 AI Config API — 支持 purposes 多选字段

**`app/api/config/ai/route.ts`:**
- GET: 返回 `purposes` 字段（字符串）；支持 `?purpose=screening` 查询参数筛选（应用层 `purposes.includes(purpose)` 过滤）
- POST: 接受 `purposes` 参数（字符串或字符串数组，存储为逗号分隔；默认 `"screening"`）

**`app/api/config/ai/[id]/route.ts`:**
- GET/PUT: 包含 `purposes` 字段
- PUT: 接受 `purposes` 更新

**通用辅助函数** `lib/services/ai-config-helper.ts` (新增 ~40 行):
```typescript
// 按用途获取 AI 配置，复用于 screening / extraction / ocr 三个场景
export async function getAIConfigByPurpose(
  purpose: 'screening' | 'extraction' | 'ocr',
  aiConfigId?: string
): Promise<{ client: OpenAI; model: string; configId: string | null }>
```
- 优先级: 指定 configId > isDefault 且 purposes 包含该 purpose > 第一个 active 且 purposes 包含该 purpose > 回退到环境变量（仅 screening/extraction）
- 提取自 `ai-screener.ts` 的 `getAIConfig` 逻辑，使其可复用
- `ai-screener.ts` 改为调用 `getAIConfigByPurpose('screening', ...)`

---

## 五、新增 API 路由

### 5.1 `app/api/resumes/[id]/extract/route.ts`

**POST** — 触发单条简历的 AI 结构化提取
- Body: `{ aiConfigId?: string }`
- 返回提取的结构化数据

### 5.2 `app/api/resumes/batch-extract/route.ts`

**POST** — 批量结构化提取
- Body: `{ ids?: string[]; aiConfigId?: string }`
- 返回 `{ total, success, failed, errors }`

### 5.3 `app/api/resumes/[id]/photo/route.ts`

**GET** — 返回候选人头像图片
- 读取 `candidatePhoto` 路径的文件
- Content-Type: `image/jpeg`
- 无照片返回 404

---

## 六、前端变更

### 6.1 `app/resume/detail/[id]/page.tsx`

**候选人头像:**
- 在信息卡片区域（candidateName 前方）添加圆形头像
- 通过 `/api/resumes/{id}/photo` 加载，404 时显示占位图标

**解析方式标记:**
- 在信息卡片中显示 Badge: "文字提取" / "OCR识别" / "AI视觉"

**新增 Tab: "结构化信息"**
- 在 "AI分析结果" 和 "模型输出" 之间
- 有数据时展示结构化视图
- 无数据时显示 "提取结构化信息" 按钮触发提取

**ResumeDetail 接口扩展:**
```typescript
candidatePhoto: string | null
structuredData: string | null
parseMethod: string | null
```

### 6.2 新增 `components/resume/StructuredDataView.tsx` (~250 行)

结构化简历数据展示组件，分区域展示：
- 基本信息: Grid 布局
- 教育经历: 时间线样式
- 工作经历: 时间线 + 职责描述
- 项目经验: 卡片式
- 技能标签: Tag 云
- 证书资质 / 语言能力 / 自我评价 / 求职意向

### 6.3 新增 `components/resume/CandidatePhoto.tsx` (~40 行)

圆形头像组件，props: `{ resumeId: string; size?: number }`

### 6.4 `app/resume/system-config/ai/page.tsx` — AI 配置页面

**表单新增:**
- "配置用途" 多选复选框组:
  - `screening` — "AI筛选"
  - `extraction` — "结构化提取"
  - `ocr` — "OCR识别（需多模态模型）"
- 默认勾选 "AI筛选"
- 保存时将选中项拼接为逗号分隔字符串

**列表新增:**
- 用途标签 Badge 组显示（多个小 Badge 并排），如: `[AI筛选] [结构化提取]`

**AIConfigItem 接口扩展:**
```typescript
interface AIConfigItem {
  // ... 现有字段 ...
  purposes: string  // "screening,extraction,ocr"
}
```

### 6.5 `app/resume/list/page.tsx` — 列表页

- 候选人名称旁显示小头像缩略图 (32x32)
- parseMethod 标记 (可选小图标)

---

## 七、异常处理管线详细设计

### 核心原则

1. **逐层降级，永不中断**: 每个步骤的异常只触发降级到下一层，不直接终止整个管线
2. **部分成功优于全部失败**: 即使文本质量不佳，也保存已获取的文本（附加警告标记），让用户可查看和手动判断
3. **异常信息累积传递**: 管线执行过程中所有警告和错误信息累积到 `parseWarnings` 数组，最终写入 `errorMessage` 字段供排查
4. **非文本步骤独立隔离**: 照片提取 (Step 6) 和结构化提取 (Step 7) 的异常绝不影响文本提取结果

### ParseResult 接口增强

```typescript
interface ParseResult {
  text: string
  name: string | null
  phone: string | null
  email: string | null
  photoPath: string | null
  parseMethod: 'text' | 'ocr' | 'vision'
  warnings: string[]           // 管线各步骤产生的警告信息
  textQualityScore: number     // 最终文本的质量评分 (0-100)
}
```

### 管线完整异常流程图

```
parseResume(filePath, fileType, options)
│
├─ [Guard] 文件读取
│   ├─ 文件不存在 → throw "简历文件不存在: {path}"
│   ├─ 文件大小为 0 → throw "简历文件为空 (0字节)"
│   └─ fs.readFileSync 异常 → throw "文件读取失败: {error.message}"
│   (以上为不可恢复错误，直接终止管线，status → ERROR)
│
├─ Step 1: pdf-parse 文本提取
│   ├─ [成功] text 有内容 → 进入 Step 2
│   ├─ [异常] pdf-parse 抛出错误（加密PDF/损坏PDF/内部错误）
│   │   ├─ 记录 warning: "pdf-parse提取失败: {message}"
│   │   ├─ text = "" (空字符串)
│   │   └─ 进入 Step 2（质量检测将判定为不合格，触发 OCR）
│   └─ [异常] pdf-parse 返回空字符串
│       ├─ 记录 warning: "pdf-parse未提取到文字"
│       └─ 进入 Step 2
│
├─ Step 2: 文本质量检测
│   ├─ score >= 30 且 text.length >= 10
│   │   ├─ parseMethod = "text"
│   │   └─ 跳过 Step 3/4 → 进入 Step 5
│   ├─ score < 30 (乱码) 或 text.length < 10 (内容不足)
│   │   ├─ 记录 warning: "文本质量不合格(score={n}): {reasons}"
│   │   ├─ 保留原始 text 为 fallbackText（后续所有路径都失败时使用）
│   │   └─ 进入 Step 3
│   └─ [注] 质量检测本身为纯计算逻辑，不会抛异常
│
├─ Step 3: 本地 OCR (tesseract.js + mupdf)
│   │
│   ├─ 3a: mupdf 加载 PDF
│   │   ├─ [成功] 获取 document 对象 → 继续
│   │   └─ [异常] mupdf 加载失败（WASM 错误/不支持的 PDF 版本/内存不足）
│   │       ├─ 记录 warning: "mupdf加载PDF失败: {message}"
│   │       └─ 跳过整个 Step 3 → 进入 Step 4
│   │
│   ├─ 3b: 逐页渲染为图片
│   │   ├─ [成功] 获取 pageImages[] → 继续
│   │   ├─ [部分成功] 某些页面渲染失败
│   │   │   ├─ 记录 warning: "第{n}页渲染失败，已跳过"
│   │   │   └─ 继续处理已成功的页面
│   │   └─ [全部失败] 所有页面都渲染失败
│   │       ├─ 记录 warning: "所有页面渲染失败"
│   │       └─ 跳过 Step 3 → 进入 Step 4
│   │
│   ├─ 3c: sharp 图片预处理
│   │   ├─ [成功] 获取预处理后图片 → 继续
│   │   └─ [异常] sharp 处理失败
│   │       ├─ 记录 warning: "图片预处理失败，使用原始图片"
│   │       └─ 使用原始未预处理的图片继续 OCR
│   │
│   ├─ 3d: tesseract.js Worker 初始化
│   │   ├─ [成功] worker 就绪 → 继续
│   │   └─ [异常] worker 创建失败（WASM 加载失败/语言数据缺失）
│   │       ├─ 记录 warning: "OCR引擎初始化失败: {message}"
│   │       └─ 跳过 Step 3 → 进入 Step 4
│   │
│   ├─ 3e: tesseract 逐页 OCR 识别
│   │   ├─ [成功] 获取各页文本 + confidence → 合并
│   │   ├─ [部分成功] 某些页面 OCR 失败或超时(单页30s)
│   │   │   ├─ 记录 warning: "第{n}页OCR失败，已跳过"
│   │   │   └─ 合并已成功页面的文本
│   │   └─ [全部失败]
│   │       ├─ 记录 warning: "OCR识别全部失败"
│   │       └─ 进入 Step 4
│   │
│   └─ 3f: OCR 结果质量评估
│       ├─ confidence >= 0.5 且合并文本 >= 20 字符
│       │   ├─ parseMethod = "ocr"
│       │   ├─ text = ocrText
│       │   └─ 跳过 Step 4 → 进入 Step 5
│       └─ confidence < 0.5 或文本过短
│           ├─ 记录 warning: "OCR结果质量不足(confidence={n}, length={n})"
│           ├─ 保留 ocrText 为 ocrFallbackText
│           └─ 进入 Step 4
│
├─ Step 4: 多模态 AI 视觉识别
│   │
│   ├─ 4a: 查找 OCR 用途的 AI 配置
│   │   ├─ [找到] 有 purposes 包含 "ocr" 且 isActive=true 的配置 → 继续
│   │   └─ [未找到] 无可用的 OCR 用途配置
│   │       ├─ 记录 warning: "未配置OCR用途的AI模型，跳过视觉识别"
│   │       └─ 进入 Step 4-fallback（最终降级决策）
│   │
│   ├─ 4b: 准备页面图片
│   │   ├─ [有图片] 使用 Step 3b 已渲染的 pageImages（如果有）→ 继续
│   │   └─ [无图片] Step 3 完全跳过，需要重新用 mupdf 渲染
│   │       ├─ [成功] 获取图片 → 继续
│   │       └─ [失败] → 进入 Step 4-fallback
│   │
│   ├─ 4c: 调用多模态 AI API
│   │   ├─ [成功] 获取识别文本 → 继续
│   │   ├─ [异常] API Key 无效 / 认证失败
│   │   │   ├─ 记录 warning: "多模态AI认证失败: {message}"
│   │   │   └─ 进入 Step 4-fallback
│   │   ├─ [异常] 模型不支持视觉输入 / 请求格式错误
│   │   │   ├─ 记录 warning: "该模型可能不支持图片输入: {message}"
│   │   │   └─ 进入 Step 4-fallback
│   │   ├─ [异常] 网络超时 (60s) / 连接失败
│   │   │   ├─ 记录 warning: "多模态AI请求超时或网络错误: {message}"
│   │   │   └─ 进入 Step 4-fallback
│   │   ├─ [异常] 速率限制 (429)
│   │   │   ├─ 记录 warning: "多模态AI请求被限流"
│   │   │   └─ 进入 Step 4-fallback
│   │   └─ [异常] Token 超限 / 内容过长
│   │       ├─ 减少发送页数(最多发前3页)重试一次
│   │       ├─ 仍失败 → 记录 warning: "图片内容超出模型限制"
│   │       └─ 进入 Step 4-fallback
│   │
│   ├─ 4d: AI 返回结果评估
│   │   ├─ 文本长度 >= 20 字符
│   │   │   ├─ parseMethod = "vision"
│   │   │   ├─ text = visionText
│   │   │   └─ 进入 Step 5
│   │   └─ 文本过短或为空
│   │       ├─ 记录 warning: "AI视觉识别结果不足"
│   │       └─ 进入 Step 4-fallback
│   │
│   └─ Step 4-fallback: 最终降级决策
│       │  此时 Step 1/3/4 均未产生合格文本，按优先级选择最佳结果：
│       │
│       ├─ 优先级1: ocrFallbackText (如果有，即使 confidence 低)
│       │   ├─ 使用 ocrFallbackText, parseMethod = "ocr"
│       │   ├─ 追加 warning: "使用了低置信度OCR结果，文本可能不完整"
│       │   └─ 进入 Step 5
│       │
│       ├─ 优先级2: fallbackText (Step 1 原始提取，即使乱码)
│       │   ├─ text.length >= 10:
│       │   │   ├─ 使用 fallbackText, parseMethod = "text"
│       │   │   ├─ 追加 warning: "文本可能包含乱码，建议配置OCR或多模态AI后重新解析"
│       │   │   └─ 进入 Step 5
│       │   └─ text.length < 10:
│       │       └─ 进入 优先级3
│       │
│       └─ 优先级3: 全部失败
│           ├─ status → ERROR
│           ├─ errorMessage = 拼接所有 warnings
│           └─ throw "简历文本提取失败。已尝试: 文字提取({原因}), OCR({原因}), AI视觉({原因})。
│                    建议: 1.检查PDF是否为有效文件 2.在AI模型配置中添加支持视觉的模型并勾选OCR识别用途后重试"
│
├─ Step 5: 文本清洗 + 联系信息提取
│   │  (此步骤在获得最终 text 后执行，无论来源是 text/ocr/vision)
│   │
│   ├─ 5a: cleanText 增强清洗
│   │   ├─ [正常] 清洗后文本有效 → 继续
│   │   └─ [边界] 清洗后文本变为空（极端情况：全是控制字符）
│   │       ├─ 回退使用清洗前的文本
│   │       └─ 记录 warning: "文本清洗后为空，已保留原始文本"
│   │
│   ├─ 5b: 文本截断
│   │   └─ > 50000 字符 → 截断，记录 warning: "文本超过50000字符，已截断"
│   │
│   ├─ 5c: extractContactInfo 正则提取
│   │   └─ 纯正则操作，不会抛异常。匹配不到则返回 null
│   │
│   └─ 5d: 最终质量评分
│       └─ 对最终 text 再次运行 analyzeTextQuality，记录 textQualityScore
│
├─ Step 6: 照片提取（独立隔离，try-catch 包裹）
│   │  条件: options 中提供了 emailId 和 resumeId
│   │  任何异常都不影响文本提取结果
│   │
│   ├─ 6a: PDF/DOCX 图片提取
│   │   ├─ [成功] 获取候选图片列表 → 继续
│   │   └─ [异常] mupdf/mammoth 图片提取失败
│   │       ├─ 记录 warning: "照片提取失败: {message}"
│   │       ├─ photoPath = null
│   │       └─ 照片步骤结束
│   │
│   ├─ 6b: 头像筛选评分
│   │   ├─ [找到] 有符合条件的候选 → 继续
│   │   └─ [未找到] 无符合尺寸/比例条件的图片
│   │       ├─ photoPath = null（不记录 warning，这是正常情况）
│   │       └─ 照片步骤结束
│   │
│   ├─ 6c: sharp 缩放 + 保存
│   │   ├─ [成功] 写入文件 → photoPath = 保存路径
│   │   ├─ [异常] sharp 处理失败
│   │   │   ├─ 记录 warning: "头像图片处理失败: {message}"
│   │   │   └─ photoPath = null
│   │   └─ [异常] 文件写入失败（磁盘空间/权限）
│   │       ├─ 记录 warning: "头像保存失败: {message}"
│   │       └─ photoPath = null
│   │
│   └─ 照片步骤结束，继续返回结果
│
└─ 返回 ParseResult { text, name, phone, email, photoPath, parseMethod, warnings, textQualityScore }


         ── Step 7: AI 结构化数据提取（异步，独立触发） ──

extractStructuredData(resumeId, aiConfigId?)
│
├─ [Guard] 简历验证
│   ├─ 简历不存在 → throw "简历不存在"
│   ├─ extractedText 为空 → throw "简历文本为空，请先完成文本解析"
│   └─ textQualityScore < 15 → 记录 warning，但仍尝试提取（AI 可能能理解部分内容）
│
├─ 7a: 获取 AI 配置
│   ├─ [找到] → 继续
│   └─ [未找到] → throw "未配置AI模型，请在AI模型配置中添加配置"
│
├─ 7b: 调用 AI 提取
│   ├─ [成功] 获取响应 → 继续
│   ├─ [异常] API 错误（认证/网络/超时/限流）
│   │   └─ throw "AI结构化提取失败: {具体错误}" (不改变 resume.status)
│   └─ [异常] Token 超限
│       ├─ 将 extractedText 截断到前 20000 字符重试一次
│       └─ 仍失败 → throw "简历文本过长，超出AI模型处理能力"
│
├─ 7c: 解析 AI 返回 JSON
│   ├─ [成功] 直接 JSON.parse → 继续
│   ├─ [失败] 尝试 regex 提取 JSON 块 (/\{[\s\S]*\}/)
│   │   ├─ [成功] → 继续
│   │   └─ [失败] → throw "AI返回格式异常，无法解析结构化数据"
│   └─ (复用 ai-screener.ts 的 parseAIResponse 健壮解析模式)
│
├─ 7d: 结构化数据校验与归一化
│   ├─ 缺失字段填充默认值（null / 空数组）
│   ├─ 类型校验：数组字段确保为数组，字符串字段确保为字符串
│   └─ 异常字段静默忽略（如 AI 返回了 schema 外的字段）
│
├─ 7e: 保存到数据库
│   ├─ resume.structuredData = JSON.stringify(validated)
│   ├─ 如 AI 提取的 basicInfo.name/phone/email 更完整 → 同步更新 candidate 字段
│   └─ [异常] DB 写入失败 → throw "结构化数据保存失败: {message}"
│
└─ 返回 StructuredResumeData
```

### 管线状态与数据库写入策略

| 管线终态 | resume.status | resume.parseMethod | resume.errorMessage | resume.extractedText |
|---------|--------------|-------------------|--------------------|--------------------|
| Step 2 通过 (文字提取成功) | 维持原逻辑 (PARSED/PENDING) | "text" | null 或拼接 warnings（如有） | 完整文本 |
| Step 3 通过 (OCR 成功) | 维持原逻辑 | "ocr" | null 或拼接 warnings | OCR 文本 |
| Step 4 通过 (视觉 AI 成功) | 维持原逻辑 | "vision" | null 或拼接 warnings | AI 识别文本 |
| Step 4-fallback 使用低质量 OCR | 维持原逻辑 | "ocr" | 拼接所有 warnings（含质量警告） | 低置信度文本 |
| Step 4-fallback 使用乱码原文 | 维持原逻辑 | "text" | 拼接所有 warnings（含乱码警告） | 乱码文本（可供人工查看） |
| 全部失败 | ERROR | null | 完整错误链 + 建议 | null |
| 照片提取失败 | 不影响 | 不影响 | 追加照片相关 warning | 不影响 |
| 结构化提取失败 | 不改变 | 不影响 | 追加提取错误信息 | 不影响 |

### errorMessage 格式规范

当存在 warnings 时，写入格式为：
```
[解析警告] 共{n}条:
1. pdf-parse提取失败: Encrypted PDF
2. OCR结果质量不足(confidence=0.3, length=15)
3. 未配置多模态AI模型，跳过视觉识别
→ 最终使用低置信度OCR结果
```

当全部失败时：
```
[解析失败] 简历文本提取失败
尝试路径:
1. 文字提取: PDF可能是扫描件，未提取到文字
2. OCR识别: tesseract置信度过低(0.12)
3. AI视觉: 未配置OCR用途的AI模型
建议: 在AI模型配置中添加支持视觉的模型并勾选"OCR识别"用途，然后重新解析
```

---

## 八、实施阶段

### Phase 1: Schema + 乱码处理（基础）
1. Prisma schema 迁移（Resume 新增 3 字段, AIConfig 新增 purpose）
2. 实现 `text-quality-detector.ts`
3. 增强 `resume-parser.ts` 中的 `cleanText`
4. 将质量检测集成到 `parseResume`（检测+报告，暂无 OCR）
5. 更新各 API 路由传递/保存新字段
6. 新增 `types/resume.ts` 类型定义

### Phase 2: 本地 OCR
7. 安装 `mupdf`, `tesseract.js`, `sharp`
8. 实现 `ocr-engine.ts`
9. 更新 `next.config.mjs` serverExternalPackages
10. 将 OCR 回退接入 `parseResume`

### Phase 3: 多模态 AI 配置 + 视觉 OCR
11. 更新 AI Config API 路由支持 `purpose`
12. 更新 AI 配置前端页面
13. 实现 `vision-ocr.ts`
14. 将视觉回退接入 `parseResume`

### Phase 4: 照片提取
15. 实现 `pdf-image-extractor.ts`
16. 实现照片 API 路由 `app/api/resumes/[id]/photo/route.ts`
17. 实现 `CandidatePhoto.tsx` 组件
18. 更新详情页显示照片
19. 将照片提取接入 `parseResume` 和 `email-fetcher`

### Phase 5: 结构化数据提取
20. 实现 `lib/prompts/extraction.ts`
21. 实现 `resume-data-extractor.ts`
22. 实现提取 API 路由 (`extract`, `batch-extract`)
23. 实现 `StructuredDataView.tsx` 组件
24. 详情页新增 "结构化信息" Tab
25. 列表页小幅更新（头像、标记）

---

## 九、关键文件清单

| 文件 | 操作 |
|------|------|
| `prisma/schema.prisma` | 修改 |
| `lib/services/resume-parser.ts` | 重大修改 |
| `lib/services/email-fetcher.ts` | 小幅修改 |
| `lib/services/text-quality-detector.ts` | 新增 |
| `lib/services/ocr-engine.ts` | 新增 |
| `lib/services/vision-ocr.ts` | 新增 |
| `lib/services/pdf-image-extractor.ts` | 新增 |
| `lib/services/resume-data-extractor.ts` | 新增 |
| `lib/services/ai-config-helper.ts` | 新增 |
| `lib/services/ai-screener.ts` | 小幅修改（getAIConfig 逻辑提取到 ai-config-helper） |
| `lib/prompts/extraction.ts` | 新增 |
| `types/resume.ts` | 新增 |
| `next.config.mjs` | 修改 |
| `app/api/config/ai/route.ts` | 修改 |
| `app/api/config/ai/[id]/route.ts` | 修改 |
| `app/api/resumes/[id]/reparse/route.ts` | 修改 |
| `app/api/resumes/batch-reparse/route.ts` | 修改 |
| `app/api/resumes/[id]/refetch/route.ts` | 修改 |
| `app/api/resumes/[id]/extract/route.ts` | 新增 |
| `app/api/resumes/batch-extract/route.ts` | 新增 |
| `app/api/resumes/[id]/photo/route.ts` | 新增 |
| `app/resume/detail/[id]/page.tsx` | 修改 |
| `app/resume/system-config/ai/page.tsx` | 修改 |
| `app/resume/list/page.tsx` | 小幅修改 |
| `components/resume/StructuredDataView.tsx` | 新增 |
| `components/resume/CandidatePhoto.tsx` | 新增 |

---

## 十、验证方案

1. **构建验证:** `yarn build` 确保无类型错误
2. **Schema 迁移:** `npx prisma migrate dev` 验证迁移成功
3. **乱码检测:** 用含 CID 字体的 PDF 测试质量检测器
4. **OCR 测试:** 用扫描型 PDF 测试 tesseract.js 识别效果
5. **视觉 OCR:** 配置多模态 AI 后，用扫描 PDF 测试端到端
6. **照片提取:** 用含头像的简历 PDF 测试照片提取和显示
7. **结构化提取:** 在详情页点击 "提取结构化信息"，验证 AI 返回和展示
8. **回归测试:** 用普通文字型 PDF 确认现有功能不受影响
9. **AI 配置:** 在配置页面创建多模态用途的 AI 配置，验证隔离性
