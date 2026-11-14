# S2 — AI 筛选管线改造 详细规格说明

> **优先级**：P1（让新简历自动进入评估流程）
>
> **依赖**：S1（数据模型重构）、S8（评估维度评分 API）
>
> **目标**：修改 AI 筛选管线，输出知识/技能两个维度的星级评分（1-5星），替代原有单一分数，让新简历自动进入评估流程。

---

## 一、功能模块定义

S2 包含以下 3 个模块：

| 模块 | 类型 | 说明 |
|------|------|------|
| AI Prompt 模板 | 修改 | 输出格式从单一分数改为双维度星级评分 |
| 筛选服务 | 修改 | 解析新格式、创建 EvaluationDimension、调用得分计算 |
| 状态流转 | 修改 | 统一为 PASSED，移除 FAILED 状态的使用 |

---

## 二、详细功能点描述

### 2.1 AI Prompt 模板修改

#### 2.1.1 文件位置

`lib/prompts/screening.ts`

#### 2.1.2 修改内容

**系统提示词**（`SCREENING_SYSTEM_PROMPT`）：

删除原有评分标准（0-30/30-60/60-80/80-100），替换为星级评分标准：

```
评分标准（每个维度1-5星）：
- 1星：完全不匹配，缺乏基本要求
- 2星：部分匹配，有明显差距
- 3星：基本匹配，满足核心要求
- 4星：良好匹配，超出基本要求
- 5星：优秀匹配，完全符合且有突出优势
```

**用户提示词**（`buildScreeningUserPrompt()`）：

输出格式从：
```json
{
  "decision": "PASS | FAIL | UNCERTAIN",
  "score": 0-100,
  "summary": "...",
  "strengths": ["..."],
  "weaknesses": ["..."],
  "detailAnalysis": "...",
  "matchedKeywords": ["..."]
}
```

改为：
```json
{
  "knowledge": 1-5,
  "skill": 1-5,
  "summary": "...",
  "strengths": ["..."],
  "weaknesses": ["..."],
  "detailAnalysis": "..."
}
```

**字段说明**：
- `knowledge`：知识维度星级（1-5），评估候选人的行业知识、专业理论水平
- `skill`：技能维度星级（1-5），评估候选人的具体工作技能
- `summary`：候选人一句话摘要
- `strengths`：优势列表（字符串数组）
- `weaknesses`：劣势列表（字符串数组）
- `detailAnalysis`：详细分析（Markdown 格式）

**通用评估提示词**（`buildGenericScreeningUserPrompt()`）：

同样修改输出格式，无职位时根据简历内容做通用评估。

#### 2.1.3 删除字段

以下字段从 Prompt 输出中移除：
- `decision` — PASS/FAIL/UNCERTAIN 概念废弃
- `score` — 0-100 分数废弃
- `matchedKeywords` — 新评估体系不涉及

---

### 2.2 筛选服务修改

#### 2.2.1 文件位置

`lib/services/ai-screener.ts`

#### 2.2.2 修改 `validateAndNormalize()` 函数

**现有逻辑**：
```typescript
interface ScreeningOutput {
  decision: 'PASS' | 'FAIL' | 'UNCERTAIN'
  score: number
  summary: string
  strengths: string[]
  weaknesses: string[]
  detailAnalysis: string
  matchedKeywords: string[]
}
```

**修改为**：
```typescript
interface ScreeningOutput {
  knowledge: number  // 1-5
  skill: number      // 1-5
  summary: string
  strengths: string[]
  weaknesses: string[]
  detailAnalysis: string
}
```

**校验规则**：
- `knowledge`：必须为 1-5 的整数，无效值默认为 3
- `skill`：必须为 1-5 的整数，无效值默认为 3
- `summary`：空字符串时默认为 "暂无摘要"
- `strengths`/`weaknesses`：非数组时默认为 `[]`
- `detailAnalysis`：空字符串时默认为 "暂无详细分析"

#### 2.2.3 修改 `screenResume()` 函数

**现有流程**（保留）：
1. 加载简历 → 校验 → 设置状态为 SCREENING → 获取 AI 客户端 → 构建 Prompt → 调用 AI → 解析响应

**修改后的后处理流程**：

```typescript
// 1. 校验并规范化 AI 输出
const parsed = validateAndNormalize(content)

// 2. 删除旧的 ScreeningResult（如果存在）
await prisma.screeningResult.deleteMany({ where: { resumeId } })

// 3. 创建新的 ScreeningResult（仅保留 AI 参考分析）
await prisma.screeningResult.create({
  data: {
    resumeId,
    aiConfigId,
    summary: parsed.summary,
    strengths: JSON.stringify(parsed.strengths),
    weaknesses: JSON.stringify(parsed.weaknesses),
    detailAnalysis: parsed.detailAnalysis,
    aiModel: model,
    tokenUsage,
    processingTime,
  },
})

// 4. 创建 EvaluationDimension 记录（AI 评分）
await prisma.evaluationDimension.createMany({
  data: [
    {
      resumeId,
      positionId: positionId || null,
      dimension: 'knowledge',
      rating: parsed.knowledge,
      source: 'ai',
    },
    {
      resumeId,
      positionId: positionId || null,
      dimension: 'skill',
      rating: parsed.skill,
      source: 'ai',
    },
  ],
})

// 5. 自动计算得分并更新 Resume
await autoCalculateScores(resumeId)

// 6. 更新简历状态为 PASSED（统一通过）
await prisma.resume.update({
  where: { id: resumeId },
  data: {
    status: 'PASSED',
    screenedAt: new Date(),
    screenedDate: new Date().toISOString().slice(0, 10),
  },
})
```

#### 2.2.4 错误处理

- AI 返回 `knowledge` 或 `skill` 为 0 或无效值：默认设为 3，不标记为 ERROR
- AI 返回格式异常（无法解析 JSON）：标记简历为 ERROR，和现有逻辑一致
- 其他异常：标记简历为 ERROR，和现有逻辑一致

---

### 2.3 状态流转修改

#### 2.3.1 现有状态映射

```typescript
const statusMap: Record<string, string> = {
  PASS: 'PASSED',
  FAIL: 'FAILED',
  UNCERTAIN: 'FAILED',
}
```

#### 2.3.2 修改后状态映射

所有通过 AI 评分的简历统一变为 `PASSED`：

```typescript
// 不再区分 PASS/FAIL/UNCERTAIN，统一通过
status: 'PASSED'
```

#### 2.3.3 业务规则

- AI 评分完成后，简历状态统一变为 `PASSED`
- 所有通过 AI 评分的简历自动进入已筛选列表
- `FAILED` 状态不再由新流程产生（现有 FAILED 记录保留，但不显示在已筛选列表的默认视图中）
- 评分为 0 或格式异常仍标记为 `ERROR`

---

## 三、数据字段说明

### 3.1 AI 输出字段

| 字段 | 类型 | 范围 | 说明 |
|------|------|------|------|
| knowledge | number | 1-5 | 知识维度星级评分 |
| skill | number | 1-5 | 技能维度星级评分 |
| summary | string | - | 候选人一句话摘要 |
| strengths | string[] | - | 优势列表 |
| weaknesses | string[] | - | 劣势列表 |
| detailAnalysis | string | - | 详细分析（Markdown） |

### 3.2 存储映射

| AI 输出字段 | 存储位置 | 存储方式 |
|------------|---------|---------|
| knowledge | EvaluationDimension.rating | 直接存储 |
| skill | EvaluationDimension.rating | 直接存储 |
| summary | ScreeningResult.summary | 直接存储 |
| strengths | ScreeningResult.strengths | JSON.stringify |
| weaknesses | ScreeningResult.weaknesses | JSON.stringify |
| detailAnalysis | ScreeningResult.detailAnalysis | 直接存储 |

### 3.3 得分计算

保存 EvaluationDimension 后，`autoCalculateScores()` 自动计算：
- `Resume.initialScore` = 知识维度得分 + 技能维度得分（使用默认初筛模型权重）
- 知识维度得分 = `knowledge × (50 ÷ 5)` = `knowledge × 10`
- 技能维度得分 = `skill × (50 ÷ 5)` = `skill × 10`

**示例**：knowledge=4, skill=3 → initialScore = 40 + 30 = 70

---

## 四、接口定义

S2 不涉及新增 API 接口。修改后的筛选流程通过现有的 `screenResume()` 函数触发：

- `POST /api/resumes/[id]/screen` — 单个简历筛选
- `POST /api/resumes/batch-screen` — 批量筛选

筛选完成后，前端通过以下接口获取数据：
- `GET /api/evaluations?resumeId=xxx` — 获取评估维度数据
- `GET /api/evaluations/score?resumeId=xxx&weightModelId=yyy` — 计算得分

---

## 五、业务规则汇总

| 编号 | 规则 | 实现位置 |
|------|------|---------|
| BR2.1 | AI 输出 knowledge 和 skill 星级（1-5） | Prompt 模板 |
| BR2.2 | 无效星级默认为 3 | validateAndNormalize |
| BR2.3 | 创建 EvaluationDimension 记录（source: "ai"） | screenResume |
| BR2.4 | 调用 autoCalculateScores 计算初筛得分 | screenResume |
| BR2.5 | 简历状态统一变为 PASSED | screenResume |
| BR2.6 | ScreeningResult 不再存储 decision/score/matchedKeywords | screenResume |
| BR2.7 | AI 参考分析（summary 等）保留写入 ScreeningResult | screenResume |
| BR2.8 | 无职位匹配时仍进行通用评估 | buildGenericScreeningUserPrompt |

---

## 六、非功能需求

### 6.1 性能要求

- AI 调用耗时不变（temperature: 0.3, max_tokens: 2000）
- 新增 EvaluationDimension 写入和得分计算增加约 50-100ms

### 6.2 兼容性

- 现有 FAILED/ERROR 状态的简历不受影响
- 现有 ScreeningResult 记录中的旧字段数据保留（S1 已删除字段，但新流程不再写入）
- 批量筛选（batch-screen）逻辑不变，仍然删除旧 ScreeningResult 后重新筛选

---

## 七、验收标准

### 7.1 AI Prompt

- [ ] 系统提示词包含 1-5 星评分标准
- [ ] 用户提示词要求输出 knowledge 和 skill 字段
- [ ] 通用评估提示词格式一致

### 7.2 筛选服务

- [ ] AI 输出正确解析为 knowledge/skill 星级
- [ ] EvaluationDimension 记录正确创建（2 条，source: "ai"）
- [ ] ScreeningResult 正确创建（不含 decision/score/matchedKeywords）
- [ ] autoCalculateScores 正确调用，Resume.initialScore 正确更新
- [ ] 简历状态变为 PASSED

### 7.3 错误处理

- [ ] 无效星级（0 或 >5）默认为 3
- [ ] AI 格式异常标记为 ERROR
- [ ] 网络/API 异常标记为 ERROR

### 7.4 兼容性

- [ ] 现有 FAILED 状态简历不受影响
- [ ] 批量筛选正常工作
- [ ] 已筛选列表正确显示新筛选的简历
