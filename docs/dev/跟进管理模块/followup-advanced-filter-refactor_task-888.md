# 跟进管理高级筛选改造

## 概述

对 `app/resume/follow-up/page.tsx` 中的高级筛选面板进行三项调整：
1. 职位筛选从单选改为多选（使用已有的 `MultiSelect` 组件）
2. 标签筛选保持现有多选能力不变
3. 引入"筛选"按钮机制——筛选条件的变更仅更新本地草稿状态，只有点击"筛选"按钮后才将条件写入 URL 触发数据加载

## Task 1: 后端 API 支持多职位筛选

修改 `app/api/follow-up/records/route.ts`：
- 将 `positionId` 参数改为 `positionIds`（逗号分隔的多值）
- `resumeWhere.positionId` 从单值等于改为 `{ in: positionIdList }`

修改 `app/api/follow-up/export/route.ts`：
- 同步将 `positionId` 改为 `positionIds`，使用 `in` 过滤

## Task 2: 前端引入本地筛选草稿状态

修改 `app/resume/follow-up/page.tsx`：
- 新增本地草稿状态：`draftTagIds`、`draftTagLogic`、`draftPositionIds`、`draftDateFrom`、`draftDateTo`、`draftContacted`
- **草稿状态仅在页面首次加载时从 URL 读取初始值**，后续筛选条件的变更只更新草稿状态，不触发 URL 变化
- **只有点击"筛选"按钮时**，才将草稿状态一次性写入 URL，触发数据加载
- URL 中的 `positionId` 改为 `positionIds`（逗号分隔）

## Task 3: 职位筛选改用 MultiSelect 组件

修改筛选面板中的职位筛选项：
- 将原有的 `<select>` 单选下拉替换为 `<MultiSelect>` 多选组件
- 绑定 `draftPositionIds` 和 `setDraftPositionIds`
- 选项由 `allPositions` 映射为 `{ value: p.id, label: p.title }`

## Task 4: 标签筛选改用草稿状态

修改 `FilterTagRow` 组件调用：
- 将 `selectedTagIds`（URL 值）替换为 `draftTagIds`（草稿值）
- `onTagsChange` 改为更新草稿状态而非直接更新 URL

## Task 5: 增加"筛选"按钮

在筛选面板底部添加"筛选"和"清除筛选"按钮：
- "筛选"按钮：将草稿状态写入 URL → 触发数据加载
- "清除筛选"按钮：清空草稿状态并立即写入 URL
- 按钮使用 `Button` 组件，主按钮样式

## Task 6: 更新已选条件汇总

修改筛选面板底部的"已选条件汇总"区域：
- 改为基于草稿状态展示当前选中的标签、职位等条件
- 支持逐个移除草稿中的条件

## Task 7: 更新 loadRecords 和导出逻辑

- `loadRecords` 中 `positionId` 改为 `positionIds`
- 导出弹窗的参数同步改为 `positionIds`
- `activeFilterCount` 计算改用 `filterPositionIds.length`

## Task 8: 更新 SPEC 文档

修改 `doc/dev/跟进管理模块SPEC.md`，同步以下变更：
- 3.4.2 高级筛选：职位筛选从单选改为多选
- 3.4.2 高级筛选：新增"筛选"按钮描述，明确筛选条件变更不立即生效，需点击按钮后统一应用
- 4. 涉及文件清单：更新修改说明
