# 岗位趋势对比 · Tooltip 总数与百分比 — 开发方案

> 在现有 `PositionTrendCompareChart` 的 Tooltip 中增加每日总份数及每个岗位的占比百分比，提升数据可读性。

---

## 1. 功能规格

### 1.1 概述

当前 Tooltip 仅显示每个岗位的每日份数（如「前端工程师 5 份」），缺少整体视角。本次优化在 Tooltip 中新增：
- **每日总数**：标题行日期右侧显示当日共计多少份
- **岗位占比**：每行份数后显示该岗位占当日总数的百分比

### 1.2 用户故事

| # | 作为 | 我想要 | 以便 |
|---|------|--------|------|
| US1 | HR | 在 Tooltip 中看到每日各岗位份数的占比 | 快速判断哪个岗位当天简历最多 |
| US2 | HR | 在 Tooltip 标题行看到当日总数 | 直观了解整体的简历收取量 |

### 1.3 Tooltip 交互

| 操作 | 行为 |
|------|------|
| Hover 图表 | 标题行显示 `日期 · 共 N 份`，下方每行显示 `岗位名 X 份 Y%` |
| 图例隐藏某岗位 | 隐藏的岗位不显示在 Tooltip 行中，但总数和百分比仍基于全部选中岗位计算 |
| 某天总数为 0 | 不显示百分比，仅显示份数 |
| 百分比格式 | 整数时不显示小数（`50%`），非整数保留 1 位小数（`62.5%`） |
| Tooltip 排序 | 保持职位选择顺序，不按值排序（不变） |

### 1.4 边界态

| 状态 | 条件 | UI 表现 |
|------|------|---------|
| 总数为 0 | 所有选中岗位在该日期 count 均为 0 | 标题 `日期 · 共 0 份`，每行 `0 份`（无百分比） |
| 某岗位为 0 | 某岗位某天 count = 0，但总数 > 0 | `0 份 (0%)` |
| 全岗位隐藏 | 通过图例隐藏所有岗位 | Tooltip 不显示（Recharts 默认行为，无变化） |

### 1.5 验收标准

- [ ] Tooltip 标题行显示 `M/D · 共 N 份`，N 为当日所有选中岗位份数之和
- [ ] 每个岗位行显示 `X 份 Y%`，Y = X / N × 100
- [ ] 百分比整数时省略小数（如 `50%`），非整数保留 1 位小数（如 `33.3%`）
- [ ] 总数为 0 时不显示百分比
- [ ] 图例隐藏某岗位后，总数和百分比不变（仍基于全部选中岗位）
- [ ] 三种粒度（每日/每周/每月）均正常显示总数和百分比
- [ ] 已有功能不受影响（图例交互、粒度切换、职位选择）

---

## 2. 技术架构

### 2.1 决策记录

| # | 决策点 | 结论 |
|---|--------|------|
| 1 | 计算位置 | 前端 `chartData` 转换时计算，不修改 API / 后端 |
| 2 | 展示方式 | 仅增强 Tooltip，图上不画总计折线 |
| 3 | 隐藏系列行为 | 总数始终基于全部选中岗位计算，不被 legend 隐藏影响 |
| 4 | 总数计算 | `chartData` 每行新增 `_total` 字段 = 所有 series 该索引 data 之和 |
| 5 | 百分比取值 | 从 `payload[0].payload._total` 获取总数 |
| 6 | 总数为 0 | 不显示百分比 |

### 2.2 文件变更清单

```
修改:
components/resume/PositionTrendCompareChart.tsx   # chartData 转换 + CustomTooltip 组件
```

无新增、无删除文件；无数据库、API、后端服务变更。

### 2.3 数据流

```
chartData 转换（useMemo）
  ├─ 遍历 dates，对每个日期索引 i：
  │     ├─ 累加所有 series[].data[i] → _total
  │     └─ row = { label, 岗位A: n1, 岗位B: n2, ..., _total }
  │
  └─ Recharts 渲染时 payload[0].payload._total 传递到 Tooltip

CustomTooltip
  ├─ 取 total = payload[0].payload._total
  ├─ 标题行: "{label} · 共 {total} 份"
  └─ 每行: "{name} {value} 份" + (total > 0 ? " {value/total*100}%" : "")
```

---

## 3. 前端设计

### 3.1 修改点 1：`chartData` 数据转换

**文件**: `components/resume/PositionTrendCompareChart.tsx` 约第 192-201 行

```typescript
const chartData = useMemo(() => {
  if (!trendData) return []
  return trendData.dates.map((d, i) => {
    const row: Record<string, string | number> = { label: d.label }
    let total = 0
    trendData.series.forEach((s) => {
      row[s.positionName] = s.data[i]
      total += s.data[i]
    })
    row._total = total  // 内部字段，下划线前缀避免与 Recharts dataKey 冲突
    return row
  })
}, [trendData])
```

关键点：
- `_total` 始终基于**全部选中岗位**计算，不受 `hiddenIds` 影响
- `_total` 是每行数据的一部分，Recharts 会将其随 `payload` 传递给 Tooltip

### 3.2 修改点 2：`CustomTooltip` 组件

**文件**: `components/resume/PositionTrendCompareChart.tsx` 约第 67-89 行

```typescript
function CustomTooltip({ active, payload, label, series }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null

  // 从原始数据行取总数（不受 legend 隐藏影响）
  const total = (payload[0]?.payload?._total as number) ?? 0

  // 百分比格式化：整数省略小数，否则保留 1 位
  const formatPct = (value: number): string | null => {
    if (total === 0) return null
    const pct = (value / total) * 100
    return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`
  }

  return (
    <div className="rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 shadow-md">
      {/* 日期 + 总数 */}
      <p className="text-sm font-medium text-foreground mb-1.5">
        {label}
        <span className="text-muted-foreground font-normal"> · 共 {total} 份</span>
      </p>
      {/* 分隔线 */}
      <div className="border-t border-[#e2e8f0] mb-1.5" />
      {/* 各职位数据 */}
      {payload.map((entry, idx) => {
        const pctStr = formatPct(entry.value as number)
        return (
          <div key={idx} className="flex items-center gap-2 text-sm">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="font-medium ml-auto">
              {entry.value} 份
              {pctStr && (
                <span className="text-muted-foreground font-normal ml-0.5">{pctStr}</span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}
```

关键点：
- `total` 从 `payload[0].payload._total` 取，即使某岗位被 legend 隐藏，`_total` 仍基于全部系列
- `pctStr` 为 `null` 时（total = 0）不渲染百分比括号
- 百分比使用 `text-muted-foreground font-normal` 弱化视觉权重，不与份数值竞争

### 3.3 不修改的部分

- `series` prop 已传入 Tooltip，无需改动
- API 响应类型 `MultiPositionTrendResponse` 无变化
- 图表图例、控件、边界态逻辑无变化

---

## 4. 测试策略

### 4.1 手动测试清单

| # | 测试场景 | 操作 | 预期结果 |
|---|---------|------|---------|
| 1 | 基本 Tooltip | Hover 折线图上某数据点 | 标题行显示 `M/D · 共 N 份`，每行 `X 份 Y%` |
| 2 | 百分比整数 | 找一天某岗位恰好占总数的 50% | 显示 `50%`（无小数） |
| 3 | 百分比小数 | 找一天 1/3 ≈ 33.3% 的数据 | 显示 `33.3%`（1 位小数） |
| 4 | 总数为 0 | 找一天所有岗位 count 均为 0 | 标题 `M/D · 共 0 份`，每行 `0 份`（无百分比） |
| 5 | 某岗位为 0 | 找一天某岗位 count = 0 但总数 > 0 | 该岗位行 `0 份 (0%)` |
| 6 | 隐藏岗位后百分比不变 | 点击 legend 隐藏某岗位，hover 同一数据点 | 总数不变，可见岗位百分比不变 |
| 7 | 每日粒度 | 切换粒度为「每日」，hover Tooltip | 总数和百分比正常 |
| 8 | 每周粒度 | 切换粒度为「每周」，hover Tooltip | 总数和百分比正常（周数据点较少时也正常） |
| 9 | 每月粒度 | 切换粒度为「每月」，hover Tooltip | 总数和百分比正常 |
| 10 | 单职位 | 仅选 1 个职位 | 总数值 = 该职位值，百分比 = 100% |
| 11 | 5 职位 | 选满 5 个职位 | 5 行 Tooltip，百分比之和 ≈ 100%（允许浮点舍入误差） |

---

## 5. 实施步骤

### 5.1 实施顺序

| 步骤 | 内容 | 文件 |
|------|------|------|
| 1 | 修改 `chartData` 转换逻辑，新增 `_total` 计算 | `PositionTrendCompareChart.tsx` |
| 2 | 修改 `CustomTooltip`，显示总数和百分比 | `PositionTrendCompareChart.tsx` |
| 3 | `yarn dev` 本地验证，按 4.1 清单逐项测试 | — |

### 5.2 预估工时

| 步骤 | 工时 |
|------|------|
| 代码修改 | 15 min |
| 本地测试验证 | 15 min |
| **合计** | **30 min** |
