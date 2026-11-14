# 联系结果登记功能实现计划

## 需求概述

为「沟通中」列表的每条跟进记录新增「是否联系上」的登记能力：
- 三种状态：未尝试（默认）、已联系上、未联系上
- 行内下拉直接修改，支持搜索栏按联系结果筛选
- 仅在沟通中阶段展示和可操作

---

## Task 1: 数据库 Schema 变更

**文件**: `prisma/schema.prisma`

在 `FollowUpRecord` 模型中新增 `contacted` 字段：

```prisma
model FollowUpRecord {
  // ... 现有字段 ...
  contacted     String   @default("NOT_CONTACTED")  // "NOT_CONTACTED" | "CONTACTED" | "CONTACT_FAILED"
}
```

---

## Task 2: 后端 API - GET 列表接口支持 contacted 筛选

**文件**: `app/api/follow-up/records/route.ts`

- 从 query params 中解析 `contacted` 参数
- 在 where 条件中增加 `contacted` 筛选逻辑
- 响应数据中已自动包含 `contacted` 字段（Prisma findMany 返回所有字段）

---

## Task 3: 后端 API - PATCH 接口支持单独更新 contacted

**文件**: `app/api/follow-up/records/[id]/route.ts`

- 在 PATCH 处理函数中新增 `contacted` 字段的单独更新逻辑（类似 note、interviewTime 的独立更新方式）
- 更新时写入 `CONTACT_RESULT_CHANGE` 操作日志

---

## Task 4: 后端 API - 导出接口支持 contacted 字段

**文件**: `app/api/follow-up/export/route.ts`

- 在 `ALL_FIELDS` 数组中增加 `{ key: 'contacted', label: '联系结果' }`
- 在 `rows` 映射的 switch 中增加 `contacted` case，输出中文标签

---

## Task 5: 前端 - 新增类型与常量定义

**文件**: `app/resume/follow-up/page.tsx`

**类型扩展**:
- 在 `FollowUpRecordItem` 接口中新增 `contacted: string` 字段（值为 `"NOT_CONTACTED"` | `"CONTACTED"` | `"CONTACT_FAILED"`）

**常量定义**:
- 新增 `CONTACT_RESULT_OPTIONS` 对象，映射三种状态到中文标签与视觉样式：
  - `NOT_CONTACTED` → 标签 `"未尝试"`，默认灰色文字
  - `CONTACTED` → 标签 `"✓ 已联系上"`，绿色文字 `text-green-600`
  - `CONTACT_FAILED` → 标签 `"⚠ 未联系上"`，橙色文字 `text-orange-600`
- 新增 `CONTACT_RESULT_CHANGE` 到 `LOG_ACTION_LABELS`（`'联系结果变更'`）
- 新增 `CONTACT_RESULT_CHANGE` 到 `LOG_CATEGORY_MAP`：图标使用 `Phone` (lucide)，圆点颜色 `bg-blue-500`，徽章样式 `bg-blue-100 text-blue-700`，标签 `'联系'`
- 在 `activeFilterCount` 计算中新增 `!!filterContacted` 计数项

**状态管理**:
- 从 URL 中解析 `filterContacted` 参数（`searchParams.get('contacted') || ''`），Suspense 感知的派生状态
- 在 `loadRecords` 中将 `contacted` 参数传递给 API（`if (filterContacted) params.set('contacted', filterContacted)`）

---

## Task 6: 前端 - 搜索栏新增联系结果筛选下拉

**文件**: `app/resume/follow-up/page.tsx`

**UI 位置**: 在搜索栏 Card 内的高级筛选面板中，位于「日期范围」筛选行下方（仅当 `activeTab === 'CONTACTING'` 时渲染）

**UI 结构**:
```
Row: [标签文本 "联系结果"] [<select> 下拉框]
```
- 左侧标签：`<span className="text-xs text-muted-foreground w-10 shrink-0">联系结果</span>`，与现有「标签」「职位」「日期」等筛选行的标签样式一致
- 下拉框：原生 `<select>` 元素，`className="flex-1 max-w-[240px] h-9 rounded-md border border-input bg-background px-3 text-sm"`，与现有「职位」筛选下拉样式一致
- 选项：`<option value="">全部</option>` + 三个状态选项（`NOT_CONTACTED` / `CONTACTED` / `CONTACT_FAILED`），value 为枚举值，显示文本为中文标签
- 交互：`onChange` 调用 `updateParams({ contacted: e.target.value, page: '' })`，选择后立即触发列表刷新

**已选条件汇总 Badge**:
- 当 `filterContacted` 非空时，在筛选面板底部的「已选」区域渲染一个 `Badge`
- Badge 显示当前选中的联系结果中文标签，右侧有 `X` 按钮可点击清除（调用 `updateParams({ contacted: '', page: '' })`）
- 样式与现有标签/职位/日期 Badge 一致

---

## Task 7: 前端 - 表格新增联系结果列与行内下拉

**文件**: `app/resume/follow-up/page.tsx`

### 7.1 表头新增列

在 `<thead>` 中，当 `activeTab === 'CONTACTING'` 时，在「职位」列之后、「备注」列之前插入新列：
```tsx
<th className="text-center py-3 px-3 font-medium hidden md:table-cell">联系结果</th>
```
> 与「职位」列保持一致的响应式显隐策略（`hidden md:table-cell`），小屏隐藏、中屏及以上显示。

### 7.2 行内下拉单元格

在 `<tbody>` 的每行 `<tr>` 中，当 `activeTab === 'CONTACTING'` 时，在「职位」列之后、「备注」列之前插入新单元格：

```tsx
<td className="py-3 px-3 text-center hidden md:table-cell" onClick={(e) => e.stopPropagation()}>
  <select
    value={record.contacted || 'NOT_CONTACTED'}
    onChange={async (e) => {
      const newValue = e.target.value
      // 调用 PATCH API
      const res = await fetch(`/api/follow-up/records/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacted: newValue }),
      })
      if (res.ok) {
        toast.success(`联系结果已更新为「${CONTACT_RESULT_OPTIONS[newValue]}」`)
        loadRecords()
      } else {
        const json = await res.json()
        toast.error(json.error || '更新失败')
      }
    }}
    className="h-8 rounded border border-input bg-background px-2 text-xs text-center focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer hover:bg-muted/30 transition-colors"
  >
    <option value="NOT_CONTACTED">未尝试</option>
    <option value="CONTACTED">✓ 已联系上</option>
    <option value="CONTACT_FAILED">⚠ 未联系上</option>
  </select>
</td>
```

**视觉细节**:
- 下拉框宽度自适应内容（`min-w-[100px]`），默认显示当前状态中文标签
- 选中不同状态时下拉框文字颜色随之变化：
  - `NOT_CONTACTED` → `text-muted-foreground`（灰色，表示未操作）
  - `CONTACTED` → `text-green-600`（绿色，正面结果）
  - `CONTACT_FAILED` → `text-orange-600`（橙色，需要关注）
- 阻止事件冒泡（`e.stopPropagation()`），防止触发行双击打开日志抽屉
- 修改成功后 toast 提示并刷新列表

**列顺序**: 候选人 | 知识 | 技能 | 得分 | 标签 | 职位 | **联系结果（新）** | 备注 | 操作

---

## 部署产物

本次变更涉及数据库结构变更（`FollowUpRecord` 表新增 `contacted` 字段），按环境隔离交付以下部署产物：

| 产物类型 | 测试环境 | 正式环境 | 说明 |
|----------|----------|----------|------|
| 环境描述 | `deploy/env/test.md` | `deploy/env/prod.md` | 环境基准配置（分支管理、构建、启动方式），部署文档引用而非改写 |
| 部署文档 | `deploy/doc/test/联系结果登记-部署文档.md` | `deploy/doc/prod/联系结果登记-部署文档.md` | 变更专用内容（概述、影响、迁移、验证、回滚、验收） |
| 部署脚本 | `deploy/script/test/001-add-contacted-field.sql` | `deploy/script/prod/001-add-contacted-field.sql` | SQLite ALTER TABLE 语句，新增 contacted 字段 |
