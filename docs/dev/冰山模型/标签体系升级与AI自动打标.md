# S12 - 标签体系升级与 AI 自动打标

## 一、概述

将跟进标签从"纯手动、无结构"升级为"分类管理、AI 辅助自动打标"，使标签成为筛选和管理候选人的有效工具。

### 核心变更

| 变更项 | 旧 | 新 |
|-------|---|---|
| 标签来源 | 全手动 | 区分 AI 自动 / HR 手动 |
| 标签分类 | 无 | 5 大类：进度/意向/能力/硬性/限制 |
| 硬性标签 | HR 手动打 | AI 筛选时自动识别并打标 |
| 重复筛选 | 无影响 | AI 标签自动刷新覆盖 |
| 预设标签 | 无 | 种子数据预置常用标签 |

---

## 二、数据模型变更

### 2.1 FollowUpTag 新增字段

```prisma
model FollowUpTag {
  id        String   @id @default(cuid())
  name      String   @unique
  color     String   @default("#3b82f6")
  source    String   @default("manual")  // "ai" | "manual"
  category  String   @default("custom")  // "progress" | "intent" | "ability" | "hard" | "constraint" | "custom"
  createdAt DateTime @default(now())
  records   FollowUpRecordTag[]
}
```

### 2.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `source` | `String` | `ai` = AI 筛选时创建，重筛时会覆盖；`manual` = HR 手动创建，永不自动删除 |
| `category` | `String` | 标签分类，UI 中分组展示 |

### 2.3 分类定义

| category | 名称 | 示例 | 打标方式 |
|----------|------|------|---------|
| `hard` | 硬性标签 | 985、211、海归、应届、3-5年经验、大厂背景 | AI 自动 |
| `intent` | 意向判断 | 高意向、观望中、薪资不匹配、可聊 | HR 手动 |

---

## 三、AI 自动打标

### 3.1 触发时机

AI 筛选完成后，在 `ai-screener.ts` 中新增打标步骤：

```
筛选完成 → 写入 ScreeningResult + EvaluationDimension
         → 【新增】识别硬性标签 + 能力分层标签
         → 删除该简历旧的 AI 标签关联
         → 创建/复用 FollowUpTag (source=ai) 并关联到 FollowUpRecord
```

### 3.2 AI 识别的标签类型

#### 硬性标签（从简历内容提取）

| 标签名 | 识别逻辑 |
|--------|---------|
| 985 | 毕业院校在 985 名单中 |
| 211 | 毕业院校在 211 名单中 |
| 海归 | 有海外学历或工作经历 |
| 应届 | 无正式工作经历，毕业时间在 1 年内 |
| 往届 | 有 1 年以上工作经历 |
| 1-3年经验 | 工作年限 1-3 年 |
| 3-5年经验 | 工作年限 3-5 年 |
| 5-10年经验 | 工作年限 5-10 年 |
| 10年+经验 | 工作年限 10 年以上 |
| 大厂背景 | 在知名企业（阿里/腾讯/字节/华为等）有工作经历 |
| 管理经验 | 有团队管理或项目负责人经历 |

#### 能力分层标签（从评分推导）

| 标签名 | 推导逻辑 |
|--------|---------|
| 高分 | 初筛得分 ≥ 80 |
| 优秀 | 综合得分 ≥ 80 |
| 有潜力 | 知识/技能评分 3-4 星但综合素质高 |
| 需培养 | 部分维度评分偏低但有成长空间 |

### 3.3 AI 打标流程

```
1. AI 筛选返回结构化结果（含 extracted_tags 字段）
2. 遍历 extracted_tags：
   a. 查找 FollowUpTag：name 匹配 + source='ai'
      → 存在：复用
      → 不存在：创建（source='ai', category 从映射表获取）
   b. 查找该简历的 FollowUpRecord：
      → 不存在：创建（status='CONTACTING'）
      → 存在：继续
   c. 关联：FollowUpRecordTag.create({ recordId, tagId })
3. 清理：删除该简历旧的 AI 来源标签关联
   （仅删除 source='ai' 的关联，保留 HR 手动打的标签）
4. 清理孤立 AI 标签：删除不再被任何记录引用的 source='ai' 的 FollowUpTag
```

### 3.4 Prompt 调整

在 `lib/prompts/screening.ts` 的输出 JSON 中新增字段：

```json
{
  "knowledge": { "rating": 3, "aspects": {...}, "reasoning": "..." },
  "skill": { "rating": 4, "aspects": {...}, "reasoning": "..." },
  "extracted_tags": [
    { "name": "985", "category": "hard" },
    { "name": "3-5年经验", "category": "hard" },
    { "name": "大厂背景", "category": "hard" }
  ]
}
```

`extracted_tags` 仅包含 AI 可识别的硬性标签和能力分层标签，不包含进度/意向/限制类。

---

## 四、前端变更

### 4.1 标签管理页

**文件**：`app/resume/system-config/tags/page.tsx`（新建或改造）

- 标签列表按 `category` 分组展示
- 每个标签显示：名称、颜色、来源（🤖 AI / 👤 HR）、分类、引用数
- AI 标签不可手动编辑/删除（或删除时提示「重新筛选会再次生成」）
- HR 可新增/编辑/删除 `source='manual'` 的标签

### 4.2 高级筛选面板

**文件**：`app/resume/follow-up/page.tsx`

在 `FilterTagRow` 中按分类分组展示标签，便于快速定位：

```
标签: [▼ 选择标签...]
  ── 硬性标签 ──
  ☑ 985  ☑ 211  ☐ 海归  ☐ 应届
  ── 能力分层 ──
  ☐ 优秀  ☐ 高分
  ── 进度标记 ──
  ☐ 已约一面  ☐ 薪资谈判中
  ...
```

### 4.3 简历详情页

跟进面板中展示已打标签，AI 标签旁有 🤖 图标提示来源。

---

## 五、实施计划

| 步骤 | 内容 | 预估 |
|------|------|------|
| 1 | Schema 变更：FollowUpTag 加 source + category | 小 |
| 2 | `prisma db push` + `prisma generate` | — |
| 3 | 种子脚本：预置常用标签（按分类） | 中 |
| 4 | AI prompt 调整：screening.ts 输出 extracted_tags | 小 |
| 5 | ai-screener.ts：解析 tags + 创建/关联/清理逻辑 | 中 |
| 6 | 前端：标签管理页改造（分类+来源展示） | 中 |
| 7 | 前端：筛选面板标签分组展示 | 小 |
| 8 | 存量：旧 AI 筛选结果不补标签，仅新筛选生效 | — |

## 六、存量兼容

- 现有标签 `source` 默认 = `manual`，`category` 默认 = `custom`
- 旧简历不会自动补打 AI 标签，需手动「重新筛选」才会生成
- HR 手动打的标签不受影响

## 七、验收标准

| 检查项 | 标准 |
|-------|------|
| 标签分类 | 标签管理页按分类分组展示 |
| AI 打标 | 筛选完成后简历自动获得硬性标签和能力标签 |
| 重筛刷新 | 重新筛选后 AI 标签自动更新，手动标签保留 |
| 来源区分 | AI 标签有 🤖 标识，HR 标签无标记 |
| 筛选面板 | 标签下拉按分类分组 |
| 孤立清理 | 删除关联后 AI 标签自动清理 |
| 存量兼容 | 旧标签 source=manual, category=custom |
