# 简历列表功能调整

## Context

简历管理模块存在四个问题需要调整：
1. 候选人名称（candidateName）解析逻辑不够智能，需要调整优先级并增加默认的 `|` 分割规则
2. 简历没有自动匹配职位的功能，需要从 fileName 中提取职位关键词并自动匹配
3. 从简历详情页返回列表时，选项卡（tab）状态会丢失
4. 简历详情页缺少文件预览功能，用户只能看到提取的文本，无法查看原始 PDF/DOCX 文件

---

## 需求1：candidateName 解析逻辑调整

### 新的优先级（从高到低）

1. 如果配置了 `subjectPattern`，用正则从 Email.subject 提取（保留现有逻辑）
2. 如果 subject 中包含半角 `|`，取第一个 `|` 前的内容作为名字（新增默认兜底规则）
3. 从 extractedText 中提取的名字（现有逻辑）
4. 全部失败 -> `"未知名称"`

### 修改文件

**`lib/services/resume-parser.ts`** - 新增两个函数：

```typescript
// 新增：默认的 | 分割提取函数（内部使用）
function extractNameFromSubjectByPipe(subject: string): string | null {
  const pipeIndex = subject.indexOf('|')
  if (pipeIndex > 0) {
    const name = subject.substring(0, pipeIndex).trim()
    return name || null
  }
  return null
}

// 新增：统一的 candidateName 解析函数（导出）
export function resolveCandidateName(
  subject: string | null,
  subjectPattern: string | null,
  textName: string | null
): string {
  // 优先级1：subjectPattern 正则提取
  if (subject && subjectPattern) {
    const name = extractCandidateNameFromSubject(subject, subjectPattern)
    if (name) return name
  }
  // 优先级2：默认 | 分割规则
  if (subject) {
    const name = extractNameFromSubjectByPipe(subject)
    if (name) return name
  }
  // 优先级3：从简历文本提取的名字
  if (textName) return textName
  // 优先级4：兜底
  return '未知名称'
}
```

**`lib/services/email-fetcher.ts`** (第204-213行) - 替换 candidateName 提取逻辑：

```typescript
// 旧：
let candidateName = parseResult.name || null
if (!candidateName && config.resumeSource?.subjectPattern && parsed.subject) {
  candidateName = extractCandidateNameFromSubject(parsed.subject, config.resumeSource.subjectPattern)
}

// 新：
const candidateName = resolveCandidateName(
  parsed.subject || null,
  config.resumeSource?.subjectPattern || null,
  parseResult.name
)
```

导入语句增加 `resolveCandidateName`。

**`app/api/resumes/[id]/reparse/route.ts`** (第36-49行) - 同步替换：

```typescript
const candidateName = resolveCandidateName(
  resume.email?.subject || null,
  resume.resumeSource?.subjectPattern || null,
  parseResult.name
)

// update data 中：candidateName 直接使用（不再 || resume.candidateName）
```

**`app/api/resumes/batch-reparse/route.ts`** (第55-68行) - 同步替换，逻辑同上。

**`app/resume/list/page.tsx`** (第551行) - 前端兜底显示：

```typescript
// 旧：{resume.candidateName || '未知'}
// 新：{resume.candidateName || '未知名称'}
```

---

## 需求2：简历自动匹配职位

### 2.1 新建 `lib/services/position-matcher.ts`

```typescript
// 从 fileName 中提取职位关键词
// 格式：【XXX_YY_ZZ】AA_BB.pdf -> 提取 XXX
export function extractPositionFromFileName(fileName: string): string | null {
  const match = fileName.match(/^【([^_】]+)/)
  return match?.[1]?.trim() || null
}

// 根据 fileName 自动匹配职位
export async function matchPositionByFileName(fileName: string): Promise<{
  positionId: string
  positionTitle: string
} | null> {
  const keyword = extractPositionFromFileName(fileName)
  if (!keyword) return null

  // 精确匹配
  let position = await prisma.position.findFirst({
    where: { title: keyword, isActive: true },
  })

  // 模糊匹配（title 包含 keyword）
  if (!position) {
    position = await prisma.position.findFirst({
      where: { title: { contains: keyword }, isActive: true },
    })
  }

  return position ? { positionId: position.id, positionTitle: position.title } : null
}
```

### 2.2 修改 `lib/services/email-fetcher.ts` - 邮件抓取时自动匹配

在现有的 `prisma.resume.update`（约第214行）中合并职位匹配：

```typescript
// 解析完成后，同时做职位匹配
const positionMatch = await matchPositionByFileName(att.filename || '')

await prisma.resume.update({
  where: { id: resume.id },
  data: {
    extractedText: parseResult.text,
    candidateName,
    candidatePhone: parseResult.phone || null,
    candidateEmail: parseResult.email || null,
    // 自动匹配职位
    ...(positionMatch ? {
      positionId: positionMatch.positionId,
      status: 'PENDING', // 匹配到职位后变为待筛选
    } : {}),
  },
})
```

### 2.3 新建 API `app/api/resumes/[id]/match-position/route.ts`

```typescript
// POST /api/resumes/[id]/match-position
// 手动触发重新匹配职位
export async function POST(request, { params }) {
  const { id } = await params
  const resume = await prisma.resume.findUnique({ where: { id } })
  if (!resume) return 404

  const match = await matchPositionByFileName(resume.fileName)
  if (!match) {
    const keyword = extractPositionFromFileName(resume.fileName)
    return { matched: false, keyword }
  }

  // 更新 positionId + status
  await prisma.resume.update({
    where: { id },
    data: {
      positionId: match.positionId,
      ...(resume.status === 'PARSED' ? { status: 'PENDING' } : {}),
    },
  })

  return { matched: true, position: match }
}
```

### 2.4 修改前端 `app/resume/list/page.tsx` - 职位列

在现有的职位列（第573-594行）中，无 position 时增加重新匹配按钮：

```tsx
// 无 position 时的渲染逻辑
<div className="flex items-center gap-1">
  {/* 重新匹配按钮 */}
  <Button
    variant="ghost" size="sm"
    onClick={() => handleMatchPosition(resume.id)}
    disabled={matchingId === resume.id}
    title="自动匹配职位"
  >
    {matchingId === resume.id ? <Loader2 spin /> : <Zap />}
  </Button>
  {/* 原有的手动选择下拉框 */}
  <Select ...>
    {positions.map(pos => <option>...</option>)}
  </Select>
</div>
```

新增状态和函数：
- `const [matchingId, setMatchingId] = useState<string | null>(null)`
- `handleMatchPosition(resumeId)` - 调用 `/api/resumes/{id}/match-position`，成功时刷新列表或本地更新

---

## 需求3：选项卡状态保持

### 3.1 修改 `app/resume/list/page.tsx` - Tab 状态 URL 驱动

```typescript
// 导入
import { useSearchParams } from 'next/navigation'

// Tab 合法值白名单
const validTabs = ['all', 'pending', 'unassigned', 'screened'] as const
type TabType = typeof validTabs[number]

// 从 URL 读取 tab（替代纯 useState）
const searchParams = useSearchParams()
const tabParam = searchParams.get('tab')
const activeTab: TabType = validTabs.includes(tabParam as TabType) ? (tabParam as TabType) : 'all'

// setActiveTab 改为函数，通过 router.replace 更新 URL
const setActiveTab = (tab: TabType) => {
  const params = new URLSearchParams(searchParams.toString())
  params.set('tab', tab)
  router.replace(`/resume/list?${params.toString()}`, { scroll: false })
}
```

移除原有的 `useState<'all' | 'pending' | 'unassigned' | 'screened'>('all')`。

Tab 按钮 onClick 逻辑不变（仍调用 setActiveTab），但内部实现变为 URL 更新。

### 3.2 修改列表页导航链接 - 携带 from_tab

```typescript
// 双击行（第538行）
onDoubleClick={() => router.push(`/resume/detail/${resume.id}?from_tab=${activeTab}`)}

// 查看按钮（第634行）
<Link href={`/resume/detail/${resume.id}?from_tab=${activeTab}`}>
```

### 3.3 修改 `app/resume/detail/[id]/page.tsx` - 返回链接

```typescript
// 导入 useSearchParams
import { useSearchParams } from 'next/navigation'

// 在组件中读取 from_tab
const searchParams = useSearchParams()
const fromTab = searchParams.get('from_tab') || 'all'

// 第221行，修改返回链接
<Link href={`/resume/list?tab=${fromTab}`}>
```

---

---

## 需求4：简历文件预览

### 4.1 安装依赖

```bash
npm install react-pdf pdfjs-dist
```

### 4.2 修改 `next.config.mjs` - 添加 webpack 配置

react-pdf 需要排除 Node canvas 模块：

```javascript
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['imapflow', 'pdf-parse', 'mammoth', 'mailparser'],
  webpack: (config) => {
    config.resolve.alias.canvas = false
    return config
  },
}
```

### 4.3 新建文件服务 API `app/api/resumes/[id]/file/route.ts`

```typescript
// GET /api/resumes/[id]/file
// 可选 query: ?format=html (仅 DOCX，使用 mammoth 转为 HTML)
//
// 默认返回原始文件二进制流:
//   PDF -> Content-Type: application/pdf
//   DOCX -> Content-Type: application/vnd.openxmlformats-officedocument...
//
// format=html 时返回 DOCX 转换后的 HTML:
//   Content-Type: text/html; charset=utf-8

export async function GET(request, { params }) {
  const { id } = await params
  const format = new URL(request.url).searchParams.get('format')
  
  // 1. 查询 Resume 获取 filePath, fileType, fileName
  // 2. 校验文件存在性 (fs.existsSync)
  // 3. 安全校验: filePath 必须包含 'data/uploads'
  // 4. format=html 且 fileType=docx: mammoth.convertToHtml({ buffer })
  // 5. 否则: 返回原始文件 Buffer
  // 6. 设置 Content-Disposition: inline; filename="..."
  // 7. 设置 Cache-Control: private, max-age=3600
}
```

### 4.4 新建 PDF 预览组件 `components/resume/PdfPreview.tsx`

```typescript
'use client'
// 使用 react-pdf 的 <Document> + <Page> 组件
// Worker 配置: pdfjs.GlobalWorkerOptions.workerSrc 使用 CDN 或 import.meta.url 方式
//
// Props: { url: string }
// 状态: numPages, pageNumber, scale
// UI: 
//   - 顶部工具栏: 翻页按钮 + 页码显示 + 缩放按钮
//   - 中间: 可滚动的 PDF 页面渲染区
//   - 错误处理: onLoadError 显示友好提示 + 下载按钮降级
```

### 4.5 新建 DOCX 预览组件 `components/resume/DocxPreview.tsx`

```typescript
'use client'
// DOCX 无法在浏览器直接预览，使用服务端 mammoth 转 HTML 方案
//
// Props: { url: string }
// 逻辑: fetch(url + '?format=html') 获取 HTML 字符串
// 渲染: dangerouslySetInnerHTML 渲染到 div 容器
//       容器添加 prose 样式确保可读性
//       底部提示"格式可能不完整，建议下载原文件查看"
```

### 4.6 新建统一预览组件 `components/resume/FilePreview.tsx`

```typescript
'use client'
// 根据 fileType 自动选择 PdfPreview 或 DocxPreview
//
// Props: { resumeId: string, fileType: string, fileName: string }
// 逻辑:
//   - 构造 URL: /api/resumes/${resumeId}/file
//   - fileType === 'pdf' -> 使用 dynamic import(PdfPreview, { ssr: false })
//   - fileType === 'docx' -> 渲染 DocxPreview
//   - 始终提供"下载原始文件"按钮作为补充
```

注意：PdfPreview 必须使用 `next/dynamic` 的 `ssr: false` 导入，避免 SSR 阶段加载 pdfjs。

### 4.7 修改 `app/resume/detail/[id]/page.tsx` - Tab 改名 + 左右分栏

**Tab 标签改名**（第353行附近）：
- `{ key: 'text', label: '简历原文' }` -> `{ key: 'text', label: '简历内容' }`

**Tab 内容重构**（第554-586行）：将原有的单卡片布局改为左右分栏：

```tsx
{activeTab === 'text' && (
  <div className="grid grid-cols-2 gap-4">
    {/* 左半：文件预览 */}
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">文件预览</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
          <FilePreview
            resumeId={resume.id}
            fileType={resume.fileType}
            fileName={resume.fileName}
          />
        </div>
      </CardContent>
    </Card>
    {/* 右半：提取文本（原有逻辑） */}
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">提取文本</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
          {resume.extractedText ? (
            <pre className="whitespace-pre-wrap text-sm font-mono">
              {resume.extractedText}
            </pre>
          ) : (
            /* 原有的错误/空状态 UI */
          )}
        </div>
      </CardContent>
    </Card>
  </div>
)}
```

---

## 新增文件清单

| 文件 | 用途 | 涉及需求 |
|------|------|---------|
| `lib/services/position-matcher.ts` | 文件名职位提取 + Position 表匹配 | 需求2 |
| `app/api/resumes/[id]/match-position/route.ts` | 手动重新匹配职位 API | 需求2 |
| `app/api/resumes/[id]/file/route.ts` | 简历文件服务 API | 需求4 |
| `components/resume/PdfPreview.tsx` | PDF 预览组件 (react-pdf) | 需求4 |
| `components/resume/DocxPreview.tsx` | DOCX 预览组件 (mammoth HTML) | 需求4 |
| `components/resume/FilePreview.tsx` | 统一文件预览组件 | 需求4 |

## 修改文件清单

| 文件 | 涉及需求 |
|------|---------|
| `lib/services/resume-parser.ts` | 需求1 |
| `lib/services/email-fetcher.ts` | 需求1 + 需求2 |
| `app/api/resumes/[id]/reparse/route.ts` | 需求1 |
| `app/api/resumes/batch-reparse/route.ts` | 需求1 |
| `app/resume/list/page.tsx` | 需求1 + 需求2 + 需求3 |
| `app/resume/detail/[id]/page.tsx` | 需求3 + 需求4 |
| `next.config.mjs` | 需求4 |

## 实施顺序

1. 需求1（candidateName 逻辑）
2. 需求2（自动匹配职位） - 与需求1共享 email-fetcher.ts 修改点
3. 需求3（Tab 状态保持）
4. 需求4（文件预览） - 安装依赖 -> 配置 -> API -> 组件 -> 详情页集成

## 验证方案

1. **需求1验证**：
   - 启动项目 `npm run dev`
   - 批量重新解析已有简历，检查 candidateName 是否按新优先级正确解析
   - 检查 subject 中包含 `|` 的邮件是否能正确提取名字
   - 检查无法提取名字的简历是否显示"未知名称"

2. **需求2验证**：
   - 手动触发邮件抓取，检查 fileName 格式为 `【XXX_YY_ZZ】` 的简历是否自动匹配到职位
   - 在列表页点击"重新匹配"按钮，验证匹配成功/失败的 toast 提示
   - 测试 fileName 不符合格式的情况，确保不会报错

3. **需求3验证**：
   - 在列表页选择"待筛选"选项卡
   - 点击某条简历进入详情
   - 点击返回按钮，确认仍然停留在"待筛选"选项卡
   - 直接访问 `/resume/list` 确认默认显示"所有"选项卡
   - 测试浏览器前进/后退按钮是否正确

4. **需求4验证**：
   - 进入一个 PDF 简历的详情页，点击"简历内容" Tab
   - 验证左侧显示 PDF 预览（可翻页、缩放），右侧显示提取文本
   - 进入一个 DOCX 简历的详情页，验证左侧显示 HTML 格式预览
   - 测试文件不存在时的错误提示
   - 验证"下载原始文件"按钮可以正常下载
