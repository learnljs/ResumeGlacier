# S8 — 评估维度评分 API 详细规格说明

> **优先级**：P0（前端页面的数据基础）
>
> **依赖**：S1（数据模型重构）
>
> **目标**：提供评估维度的读写接口和得分计算服务，为所有前端页面提供数据层支撑。

---

## 一、功能模块定义

S8 包含以下 3 个模块：

| 模块 | 类型 | 说明 |
|------|------|------|
| 评估维度 API | 新建 | 3 个 RESTful 接口（查询、保存、计算得分） |
| 评估服务层 | 新建 | `lib/services/evaluation-service.ts` |
| 得分计算引擎 | 新建 | 维度得分 + 百分制得分计算逻辑 |

---

## 二、详细功能点描述

### 2.1 API 接口

#### 2.1.1 接口列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/evaluations` | 获取指定简历的评估维度数据 |
| POST | `/api/evaluations` | 批量保存评估维度评分 |
| GET | `/api/evaluations/score` | 计算指定简历在指定权重模型下的得分 |

#### 2.1.2 GET /api/evaluations

**功能**：获取指定简历的所有评估维度数据。

**请求参数**（Query）：
- `resumeId`（必填）：简历 ID
- `positionId`（可选）：职位 ID，用于筛选特定职位的评估数据

**响应格式**（200）：
```json
{
  "evaluations": [
    {
      "id": "cuid",
      "resumeId": "resume-cuid",
      "positionId": "position-cuid",
      "dimension": "knowledge",
      "rating": 4,
      "comment": "行业知识扎实，有3年相关经验",
      "source": "ai",
      "evaluatedAt": "2024-01-01T00:00:00.000Z"
    },
    {
      "id": "cuid",
      "resumeId": "resume-cuid",
      "positionId": "position-cuid",
      "dimension": "skill",
      "rating": 3,
      "comment": null,
      "source": "ai",
      "evaluatedAt": "2024-01-01T00:00:00.000Z"
    },
    {
      "id": "cuid",
      "resumeId": "resume-cuid",
      "positionId": "position-cuid",
      "dimension": "selfAwareness",
      "rating": null,
      "comment": null,
      "source": "manual",
      "evaluatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**查询逻辑**：
- 如果传了 `positionId`，只返回该 `positionId` 对应的评估记录
- 如果没传 `positionId`，返回该简历下所有评估记录（可能包含多个职位的数据）
- 按 `dimension` 固定顺序返回：knowledge → skill → selfAwareness → personality → values → motivation

**错误响应**：
- 400：`{ "error": "缺少 resumeId 参数" }`
- 500：`{ "error": "未知错误" }`

#### 2.1.3 POST /api/evaluations

**功能**：批量保存评估维度评分，保存后自动重新计算得分并更新 Resume 表。

**请求体**：
```json
{
  "resumeId": "resume-cuid",
  "positionId": "position-cuid",
  "dimensions": [
    {
      "dimension": "knowledge",
      "rating": 4,
      "comment": "行业知识扎实"
    },
    {
      "dimension": "skill",
      "rating": 3,
      "comment": null
    }
  ],
  "source": "manual"
}
```

**字段校验**：
- `resumeId`：必填，关联的简历必须存在
- `positionId`：可空，关联的职位必须存在（如果传了的话）
- `dimensions`：必填，非空数组
- `dimensions[].dimension`：必填，仅允许 6 个合法值
- `dimensions[].rating`：可空，如果传了则范围为 1-5 的整数
- `dimensions[].comment`：可空，最大 500 字符
- `source`：必填，仅允许 `ai` 或 `manual`

**处理逻辑**：
1. 校验请求参数
2. 遍历 `dimensions` 数组，对每个维度：
   - 查询是否已存在 `[resumeId, positionId, dimension]` 的记录
   - 如果存在：更新 `rating`、`comment`、`source`、`evaluatedAt`
   - 如果不存在：创建新记录
3. 调用 `autoCalculateScores(resumeId)` 重新计算得分
4. 返回保存结果

**成功响应**（200）：
```json
{
  "success": true,
  "saved": 2,
  "scores": {
    "initialScore": 76.0,
    "compositeScore": null
  }
}
```

**错误响应**：
- 400：`{ "error": "缺少 resumeId" }`
- 400：`{ "error": "dimensions 不能为空" }`
- 400：`{ "error": "无效的维度名称: xxx" }`
- 400：`{ "error": "评分必须在 1-5 之间" }`
- 400：`{ "error": "文本评价不能超过500字符" }`
- 404：`{ "error": "简历不存在" }`
- 500：`{ "error": "未知错误" }`

#### 2.1.4 GET /api/evaluations/score

**功能**：计算指定简历在指定权重模型下的得分。不修改数据库，仅计算并返回。

**请求参数**（Query）：
- `resumeId`（必填）：简历 ID
- `weightModelId`（必填）：权重模型 ID

**处理逻辑**：
1. 获取该简历的所有评估维度数据
2. 获取指定的权重模型配置
3. 根据权重模型的 category 决定计算哪些维度
4. 对每个维度：`维度得分 = rating × (weight ÷ 5)`
5. 未评分（rating = null）的维度得 0 分
6. `总分 = 所有维度得分之和`

**成功响应**（200）：
```json
{
  "weightModel": {
    "id": "cuid",
    "name": "冰山-默认模型",
    "category": "iceberg"
  },
  "dimensions": [
    {
      "dimension": "knowledge",
      "label": "知识",
      "rating": 4,
      "weight": 15,
      "score": 12.0,
      "comment": "行业知识扎实"
    },
    {
      "dimension": "skill",
      "label": "技能",
      "rating": 3,
      "weight": 15,
      "score": 9.0,
      "comment": null
    },
    {
      "dimension": "selfAwareness",
      "label": "自我认知",
      "rating": null,
      "weight": 20,
      "score": 0,
      "comment": null
    },
    {
      "dimension": "personality",
      "label": "品质特质",
      "rating": null,
      "weight": 20,
      "score": 0,
      "comment": null
    },
    {
      "dimension": "values",
      "label": "价值观",
      "rating": null,
      "weight": 15,
      "score": 0,
      "comment": null
    },
    {
      "dimension": "motivation",
      "label": "动机",
      "rating": null,
      "weight": 15,
      "score": 0,
      "comment": null
    }
  ],
  "totalScore": 21.0
}
```

**错误响应**：
- 400：`{ "error": "缺少 resumeId 参数" }`
- 400：`{ "error": "缺少 weightModelId 参数" }`
- 404：`{ "error": "简历不存在" }`
- 404：`{ "error": "权重模型不存在" }`

---

### 2.2 评估服务层

#### 2.2.1 文件位置

`lib/services/evaluation-service.ts`

#### 2.2.2 导出函数

```typescript
/**
 * 获取指定简历的评估维度列表
 * @param resumeId 简历 ID
 * @param positionId 可选，职位 ID
 * @returns 评估维度数组
 */
export async function getEvaluations(
  resumeId: string,
  positionId?: string
): Promise<EvaluationDimension[]>

/**
 * 批量保存评估维度评分
 * 采用 upsert 逻辑：存在则更新，不存在则创建
 * @param resumeId 简历 ID
 * @param positionId 职位 ID（可空）
 * @param dimensions 维度评分数组
 * @param source 评分来源
 * @returns 保存的记录数
 */
export async function saveEvaluations(
  resumeId: string,
  positionId: string | null,
  dimensions: { dimension: string; rating: number | null; comment?: string }[],
  source: 'ai' | 'manual'
): Promise<number>

/**
 * 计算指定简历在指定权重模型下的得分
 * 不修改数据库，仅计算返回
 * @param resumeId 简历 ID
 * @param weightModelId 权重模型 ID
 * @returns 得分详情
 */
export async function calculateScore(
  resumeId: string,
  weightModelId: string
): Promise<{
  weightModel: { id: string; name: string; category: string }
  dimensions: { dimension: string; label: string; rating: number | null; weight: number; score: number; comment: string | null }[]
  totalScore: number
}>

/**
 * 自动用默认模型计算初筛/综合得分并更新 Resume 表
 * - 用默认初筛模型计算 initialScore（知识+技能）
 * - 用默认冰山模型计算 compositeScore（全部6维度）
 * @param resumeId 简历 ID
 */
export async function autoCalculateScores(resumeId: string): Promise<void>
```

#### 2.2.3 得分计算逻辑

**公式**：
```
维度得分 = rating × (weight ÷ 5)
百分制得分 = 所有维度得分之和
```

**示例**：

| 维度 | 星级评分 | 权重 | 倍数 (权重÷5) | 维度得分 |
|------|---------|------|--------------|---------|
| 知识 | 4 | 50% | 10 | 4 × 10 = 40 |
| 技能 | 3 | 50% | 10 | 3 × 10 = 30 |
| **初筛得分** | | | | **70** |

| 维度 | 星级评分 | 权重 | 倍数 (权重÷5) | 维度得分 |
|------|---------|------|--------------|---------|
| 知识 | 4 | 15% | 3 | 4 × 3 = 12 |
| 技能 | 3 | 15% | 3 | 3 × 3 = 9 |
| 自我认知 | 5 | 20% | 4 | 5 × 4 = 20 |
| 品质特质 | 4 | 20% | 4 | 4 × 4 = 16 |
| 价值观 | 3 | 15% | 3 | 3 × 3 = 9 |
| 动机 | 4 | 15% | 3 | 4 × 3 = 12 |
| **综合得分** | | | | **78** |

**边界值处理**：
- 未评分维度（rating = null）：该维度得 0 分，不参与计算
- 所有维度都未评分：总分为 0
- 只有部分维度评分：只计算已评分维度的得分之和
- 得分精度：保留 1 位小数（Float 类型）

#### 2.2.4 autoCalculateScores 逻辑

```typescript
export async function autoCalculateScores(resumeId: string) {
  // 1. 获取默认初筛模型
  const initialModel = await prisma.weightModel.findFirst({
    where: { category: 'initial', isDefault: true }
  })

  // 2. 获取默认冰山模型
  const icebergModel = await prisma.weightModel.findFirst({
    where: { category: 'iceberg', isDefault: true }
  })

  // 3. 计算初筛得分
  let initialScore: number | null = null
  if (initialModel) {
    const result = await calculateScore(resumeId, initialModel.id)
    initialScore = result.totalScore > 0 ? result.totalScore : null
  }

  // 4. 计算综合得分
  let compositeScore: number | null = null
  if (icebergModel) {
    const result = await calculateScore(resumeId, icebergModel.id)
    compositeScore = result.totalScore > 0 ? result.totalScore : null
  }

  // 5. 更新 Resume 表
  await prisma.resume.update({
    where: { id: resumeId },
    data: { initialScore, compositeScore }
  })
}
```

---

### 2.3 维度配置常量

#### 2.3.1 文件位置

`lib/constants/evaluation.ts`

#### 2.3.2 常量定义

```typescript
/** 评估维度定义 */
export const EVALUATION_DIMENSIONS = {
  knowledge: { label: '知识', order: 1, icebergLayer: 'visible' },
  skill: { label: '技能', order: 2, icebergLayer: 'visible' },
  selfAwareness: { label: '自我认知', order: 3, icebergLayer: 'hidden' },
  personality: { label: '品质特质', order: 4, icebergLayer: 'hidden' },
  values: { label: '价值观', order: 5, icebergLayer: 'hidden' },
  motivation: { label: '动机', order: 6, icebergLayer: 'hidden' },
} as const

export type DimensionKey = keyof typeof EVALUATION_DIMENSIONS

/** 维度 key 列表，按固定顺序 */
export const DIMENSION_KEYS: DimensionKey[] = [
  'knowledge', 'skill', 'selfAwareness', 'personality', 'values', 'motivation'
]

/** 初筛模型包含的维度 */
export const INITIAL_DIMENSIONS: DimensionKey[] = ['knowledge', 'skill']

/** 冰山模型包含的维度 */
export const ICEBERG_DIMENSIONS: DimensionKey[] = DIMENSION_KEYS

/** 合法的评分来源 */
export const EVALUATION_SOURCES = ['ai', 'manual'] as const

/** 合法的模型分类 */
export const WEIGHT_MODEL_CATEGORIES = ['initial', 'iceberg'] as const
```

---

## 三、用户交互流程

### 3.1 评估维度查询流程

```
前端组件加载
  → 调用 GET /api/evaluations?resumeId=xxx&positionId=yyy
  → 获取评估维度列表
  → 渲染雷达图和评分组件
```

### 3.2 评分保存流程

```
用户点击维度的星级评分
  → 弹出评分组件（星级选择 + 文本评价）
  → 用户选择星级（1-5）
  → 可选：输入文本评价
  → 点击"保存"
  → 调用 POST /api/evaluations
  → 成功 → 刷新雷达图和得分
  → 失败 → toast 提示错误
```

### 3.3 得分计算流程（前端切换权重模型时）

```
用户在权重模型下拉框中选择模型
  → 调用 GET /api/evaluations/score?resumeId=xxx&weightModelId=yyy
  → 获取各维度得分和总分
  → 更新右侧得分展示区域
```

---

## 四、数据字段说明

### 4.1 API 请求/响应字段

#### GET /api/evaluations

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| resumeId | string | 是 | 简历 ID |
| positionId | string | 否 | 职位 ID |

#### POST /api/evaluations

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| resumeId | string | 是 | 简历 ID |
| positionId | string | 否 | 职位 ID |
| dimensions | array | 是 | 维度评分数組 |
| dimensions[].dimension | string | 是 | 维度标识 |
| dimensions[].rating | number\|null | 否 | 星级评分 1-5 |
| dimensions[].comment | string | 否 | 文本评价，最大 500 字符 |
| source | string | 是 | 评分来源：`ai` 或 `manual` |

#### GET /api/evaluations/score

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| resumeId | string | 是 | 简历 ID |
| weightModelId | string | 是 | 权重模型 ID |

### 4.2 得分计算中间数据

```typescript
interface DimensionScore {
  dimension: string    // 维度标识
  label: string        // 中文名称
  rating: number | null // 星级评分
  weight: number       // 权重百分比
  score: number        // 维度得分 = rating × (weight ÷ 5)
  comment: string | null
}

interface ScoreResult {
  weightModel: { id: string; name: string; category: string }
  dimensions: DimensionScore[]
  totalScore: number   // 所有维度得分之和
}
```

---

## 五、业务规则汇总

| 编号 | 规则 | 实现位置 |
|------|------|---------|
| BR8.1 | 维度得分 = rating × (weight ÷ 5) | calculateScore |
| BR8.2 | 百分制得分 = 所有维度得分之和 | calculateScore |
| BR8.3 | 未评分维度（rating = null）得 0 分 | calculateScore |
| BR8.4 | 保存评分后自动调用 autoCalculateScores | saveEvaluations |
| BR8.5 | 初筛得分使用默认初筛模型计算 | autoCalculateScores |
| BR8.6 | 综合得分使用默认冰山模型计算 | autoCalculateScores |
| BR8.7 | 总分为 0 时 Resume 的得分字段设为 null | autoCalculateScores |
| BR8.8 | dimension 仅允许 6 个合法值 | API 校验 |
| BR8.9 | rating 范围为 1-5 或 null | API 校验 |
| BR8.10 | comment 最大 500 字符 | API 校验 |
| BR8.11 | source 仅允许 ai 或 manual | API 校验 |
| BR8.12 | upsert 逻辑：存在则更新，不存在则创建 | saveEvaluations |

---

## 六、非功能需求

### 6.1 性能要求

- GET /api/evaluations 响应时间 < 200ms
- POST /api/evaluations 响应时间 < 500ms（含得分重算）
- GET /api/evaluations/score 响应时间 < 300ms
- 得分计算为纯数学运算，无外部依赖

### 6.2 数据一致性

- 保存评分和更新得分必须在同一事务中完成
- 如果得分更新失败，评分保存也应回滚

### 6.3 并发安全

- SQLite 不支持并发写入，评估维度的写入操作需串行执行
- 建议使用 Prisma 的默认连接池配置（连接数 = 1）

---

## 七、验收标准

### 7.1 GET /api/evaluations

- [ ] 传入 `resumeId` 返回该简历的所有评估维度
- [ ] 传入 `resumeId` + `positionId` 正确筛选
- [ ] 返回数据按 dimension 固定顺序排列
- [ ] 缺少 `resumeId` 返回 400 错误
- [ ] 简历不存在时返回空数组（或 404，需统一）

### 7.2 POST /api/evaluations

- [ ] 创建新维度记录成功
- [ ] 更新已有维度记录成功（upsert）
- [ ] 保存后自动触发得分重算
- [ ] 返回的 `scores` 包含正确的 initialScore 和 compositeScore
- [ ] `rating` 为 null 时正确保存（清除评分）
- [ ] `comment` 正确保存，最大 500 字符
- [ ] 无效 dimension 值返回 400 错误
- [ ] rating 超出 1-5 范围返回 400 错误
- [ ] comment 超过 500 字符返回 400 错误
- [ ] 简历不存在返回 404 错误

### 7.3 GET /api/evaluations/score

- [ ] 返回指定权重模型的各维度得分明细
- [ ] 得分计算公式正确：rating × (weight ÷ 5)
- [ ] 未评分维度得 0 分
- [ ] totalScore 为所有维度得分之和
- [ ] 得分保留 1 位小数
- [ ] 权重模型不存在返回 404 错误

### 7.4 autoCalculateScores

- [ ] 使用默认初筛模型计算 initialScore
- [ ] 使用默认冰山模型计算 compositeScore
- [ ] 正确更新 Resume 表的 initialScore 和 compositeScore 字段
- [ ] 所有维度未评分时，得分字段设为 null
- [ ] 部分维度评分时，只计算已评分维度

### 7.5 综合验证

- [ ] 新建 EvaluationDimension 记录后，Resume 的 initialScore 自动更新
- [ ] 修改已有评分后，Resume 的得分立即更新
- [ ] 清除评分（rating = null）后，得分正确重新计算
- [ ] 不同 positionId 的评估数据互不干扰
