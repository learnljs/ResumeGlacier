# UI 重新设计 — 迭代方案文档

> **项目**：ResumeGlacier（简历智能筛选系统）
> **当前主题**：石墨（极简 · 高级，唯一主题）
> **文档定位**：重构批次 **B12（UI 令牌化 + 响应式）** 的执行子文档（对应 `docs/refactor-audit.md` §5 批次计划第 14 项）。**令牌口径以 `app/globals.css` 的 `:root` + `tailwind.config.ts` 为准**，与 `docs/refactor-audit.md` §5 B12、`.claude/skills/refactor.md` 第 4 章保持一致。
> **文档用途**：跨设备继续 UI 迭代的完整清单与方案。标注 ✅ 为已完成、⭕ 为待办、⚠️ 为需决策。
> **配套文档**：`docs/refactor-audit.md`（原始审计，含 B7-B11 重构批次）、`.claude/skills/refactor.md`（重构约束）、`docs/refactor-prompts.md`（提示词模板，P5 = UI 重设计）、`.ui-mockups/`（10 套视觉 mockup）。
> **技术栈**：Next.js 16 + Tailwind CSS + shadcn/ui 风格 + CSS 变量设计令牌（`app/globals.css`）

---

## 一、已完成的设计基座（当前状态）

### 1.1 主题固化（✅ 已完成）
- `app/globals.css`：`:root` 已固化为**石墨主题**（唯一），删除了冰川蓝/墨金朱/现状三套 `[data-theme]`。
- 设计令牌：`--background`(220 20% 99%)、`--primary`(近黑石墨)、`--accent`(蓝紫 250 55% 48%)、`--sidebar`(深石墨 220 12% 12%)、语义色 `--success/--warning/--info/--destructive`、`--radius: 0.5rem`（小圆角，Linear 风）。
- `tailwind.config.ts`：注册了 `sidebar` 色系 + `success/warning/info`。
- 主题切换器组件已删除（`theme-preview-switcher.tsx` 已移除，无残留引用）。

### 1.2 布局基座（✅ 已完成）
- `app/resume/layout.tsx`：左侧深石墨侧边栏（`--sidebar` 令牌），活跃项蓝紫高亮。
- `components/resume/page-shell.tsx`：内容容器（`p-6 space-y-4`），列表/跟进/复用页已套用。
- 系统配置的 positions / prompts 已套 `ResumePageShell` + `max-w-3xl`（与 sources 一致）。

### 1.3 列表页卡片流（✅ 已完成）
- **简历列表 `/resume/list`**、**已筛选 `/resume/screened`**、**邮箱状态 `/resume/system-config/email-status`**：从密集表格改为**候选人卡片流**（圆角卡片 + 头像圆标 + 状态徽标 + 评分进度条 + 操作区）。
- 卡片 hover 已去除边框变色/阴影浮起（用户明确要求），只保留极轻背景变化。
- 复制姓名按钮移到姓名旁（不再在卡片最右）。

### 1.4 详情页重构（✅ 已完成，尚有打磨空间见 §3.4）
- 顶部工具条（sticky）：导航（返回/上一份/下一份+序号）+ 操作（评估职位下拉 + 开始评估 + 重新解析/获取 icon + 跟进/不合适）。
- 候选人卡片：大头像 + 姓名/状态/职位 + 可点击联系方式（tel:/mailto:）+ 右侧评分大数字 + 进度条。
- 六边形雷达图 → **横向维度进度条**（`evaluation-radar.tsx` 重写）。
- 得分计算明细 → 进度条 + 星级（`score-cards.tsx` 升级）。
- 「邮件信息」tab 已删除（信息已并入候选人卡片）。

---

## 二、设计规范（后续迭代应遵循）

### 2.1 配色令牌（已定义，勿再硬编码）
| 用途 | 令牌 | 备注 |
|------|------|------|
| 主按钮/链接/选中 | `primary` (220 18% 22% 近黑) | 石墨主题下主按钮为深色 |
| 品牌点缀 | `accent` (蓝紫 250 55% 48%) | 唯一彩色点缀，克制使用 |
| 成功/通过 | `success` | 星级高分、已评估、进度条 ≥4 星 |
| 信息/进行中 | `info` | 筛选中、处理中 |
| 警告/待定 | `warning` | 待筛选、3 星 |
| 错误 | `destructive` | 异常、失败、低分 |
| 侧边栏 | `sidebar*` | 深石墨，活跃项蓝紫 |

**铁律**：所有页面颜色必须走令牌（`bg-success/10 text-success` 这类），**禁止** `bg-yellow-100`、`text-blue-600`、`border-red-200` 等 Tailwind 裸色。

> **口径对齐**：本表与 `docs/refactor-audit.md` §5 **B12（UI 令牌化）**、`.claude/skills/refactor.md` 第 4 章（样式约束）一致。审计文档 A6/B3 提到的「得分档位函数（`lib/constants/score.ts`）」属 B8 批次（规则单点），完成 B8 后本表的 `scoreColor`/`scoreBarColor` 应迁移到该单点，勿在页面内重复定义。

### 2.2 布局规范
- 侧边栏统一在 `app/resume/layout.tsx`（深石墨）。
- 列表页容器：`ResumePageShell`（`p-6 space-y-4`）。
- 系统配置页容器：`ResumePageShell` + `max-w-3xl`（左侧对齐、右侧留白）。**webhooks 用 `max-w-4xl` 需统一**（见 §3.2）。
- 详情页：自有 sticky 工具条（不加 Shell，避免双 sticky）。
- 卡片：`rounded-xl border bg-card p-3.5`，hover 仅背景微亮（`hover:bg-muted/40`），**不加阴影/边框变色**。

### 2.3 交互规范
- 卡片单击打开详情（list 已改，双击已废弃）。
- 联系方式可点击（tel:/mailto:）。
- 评分可视化：大数字 + 进度条 / 维度星级 + 进度条。

---

## 三、待办改造清单（⭕ 未完成）

### 3.1 系统配置页全面套 Shell + 令牌化（⭕ 高优先级）
以下页面**未使用 ResumePageShell**，且仍有大量硬编码颜色，是当前与整体风格最不一致的区域：

| 页面 | 当前状态 | 待办 |
|------|---------|------|
| `system-config/email` | `p-6 max-w-3xl space-y-6`，无 Shell，14 处硬编码色 | 套 `ResumePageShell`；`bg-green-50/bg-red-50` 测试结果块 → `bg-success/10 / bg-destructive/10`；`text-red-500 hover:bg-red-50` → 令牌 |
| `system-config/ai` | 同上，13 处硬编码色 | 同上；`text-yellow-500 hover:bg-yellow-100` → `text-warning hover:bg-warning/10` |
| `system-config/webhooks` | `p-6 max-w-4xl`，无 Shell，4 处 | 套 Shell + **宽度统一为 max-w-3xl**；`bg-blue-100 text-blue-700` → `bg-info/10 text-info`；`text-red-600 hover:bg-red-100/60` → 令牌 |
| `system-config/sources` | `p-6 max-w-3xl`，无 Shell，4 处 | 套 Shell；`text-red-500 hover:bg-red-50` → 令牌 |
| `system-config/positions/disabled` | 无 Shell，`p-6 space-y-6` | 套 Shell + max-w-3xl；`border-red-200 hover:bg-red-50` → 令牌 |
| `system-config/positions/new` | 无 Shell | 套 Shell + max-w-3xl |
| `system-config/database` | 有表格（`bg-muted/50` 表头） | 表头按 Linear 风升级；`bg-red-50 border-red-200` → 令牌 |

### 3.2 布局宽度统一（⭕ 中优先级）
- **webhooks 页 `max-w-4xl` → `max-w-3xl`**（与其他系统配置一致）。
- `reevaluate` 页用了 `ResumePageShell className="space-y-6 max-w-[1600px] mx-auto"` —— **与其他页的默认全宽不一致**，需决策：
  - ⚠️ 方案 A：去掉 `max-w-[1600px]`，与其他列表页一致（推荐，简单）。
  - ⚠️ 方案 B：保留宽容器（如果该页需要展示更多列）。

### 3.3 剩余硬编码颜色清理（⭕ 中优先级）
- `task-batches` 6 处、`prompts` 1 处（`bg-amber-600` 按钮）、`positions/disabled` 1 处、`list` 1 处、`follow-up` 1 处。
- **详情页** `app/resume/detail/[id]/page.tsx`：检查残留 `border-orange-300 text-orange-600` 等（重写时大部分已令牌化，需复查）。
- 移动端顶部 header（`layout.tsx` 里 `bg-card`）与深色侧栏的视觉衔接。

### 3.4 详情页打磨（⭕ 中优先级，用户已提出方向）
- 评估维度进度条：可考虑加**权重显示**、或长按展开评语。
- 得分计算：多模型手风琴在窄容器下偏挤，可考虑「默认模型高亮 + 其他折叠」的优先级展示。
- 候选人卡片：评分大数字排版、头像尺寸可再调。
- 详情页操作按钮较多（评估下拉 + 开始评估 + 2 icon + 跟进/不合适），移动端需考虑折叠为「更多」菜单。

### 3.5 Dashboard 数据概览（⭕ 待评估）
- 已改为全宽（去掉 max-w-7xl）。
- 可打磨：KPI 卡 hover 效果、趋势图配色（走 `--chart-*` 令牌）、跟进看板的卡片风格与列表页统一。
- 注意：dashboard 未用 Shell，但其布局（KPI 网格 + 图表 + 看板）是全宽设计，**与列表页不同是合理的**，无需强套 Shell。

### 3.6 跟进管理 follow-up（⭕ 待评估）
- 保留表格（密集评分矩阵，卡片化会丢失对比能力）——这是有意的设计决策。
- 已做：表头小号灰字、行 hover、头像圆标、令牌化。
- 可打磨：状态流转按钮色（已令牌化）、同步列、时间线视觉。

### 3.7 未分类页面
- `test-photo/page.tsx`：开发调试页，可忽略或删除。
- `resume/page.tsx`、`config/page.tsx`：纯 redirect，无需改。

---

## 四、待决策事项（⚠️）

| # | 决策点 | 选项 | 建议 |
|---|--------|------|------|
| 1 | reevaluate 页宽度 | A. 去 max-w 与其他页统一 / B. 保留宽容器 | A（推荐） |
| 2 | 系统配置是否加内部 tab 导航 | A. 不加（靠侧边栏）/ B. 子页顶部加 tab 条 | 维持现状 A，除非用户要求 |
| 3 | 跟进管理是否卡片化 | A. 保持表格 / B. 改卡片流 | A（信息密度优先，已有明确理由） |
| 4 | 深色模式 | A. 暂不做 / B. 预留 `dark` 令牌 | A（石墨已含深色侧栏，整体偏浅色，先不做全站 dark） |
| 5 | 演示数据脚本 `scripts/seed-demo-data.ts` | A. 保留（便于预览）/ B. 删除 | 保留，但**生产部署前必须删除并清理演示数据** |

---

## 五、验证方式

- 改完一个页面：`npx tsc --noEmit -p tsconfig.json` 无新错误 + 浏览器访问对应路由 200。
- 全量检查：`grep -rn "bg-yellow-\|text-blue-600" app/resume` 无残留（仅允许 `border-amber-500/30` 这类带 alpha 的已豁免项）。
- 端到端：Playwright MCP（`.playwright-mcp/` 目录）。

---

## 六、已知环境注意事项（跨设备必读）

1. **Trae CN 沙箱**：项目在 `~/Desktop/hr`，需在 Trae 设置 → AI Agent → 允许文件夹加入该路径，否则 agent 无法写文件。seatbelt 沙箱是进程启动时加载，加白名单后需重启会话。
2. **`.env`**：本地 `.env` 已生成（含 `ENCRYPTION_KEY`，64 位 hex）。**换设备前必须复制 `.env`**，否则加密数据（邮箱密码/AI Key/Webhook URL）无法解密。`.env` 不入库（gitignore）。
3. **数据库**：`prisma/data/resume.db` 已初始化 + 10 条演示数据（`scripts/seed-demo-data.ts`）。换设备需复制 `prisma/data/` + `data/uploads/`（如保留演示数据）。
4. **dev server**：`npm run dev`（3000 端口）。浏览器看不到更新时：强刷（Cmd+Shift+R）或**无痕窗口**验证。
5. **邮件列表页 `/resume/emails` 已被下线**（git `9f0d648`），对应 API `/api/emails` 不存在。邮箱状态页在 `/resume/system-config/email-status`。

---

## 六·五、换设备 6 步流程（对齐重构批次）

> 在**另一台设备**继续迭代时，按以下顺序执行（对应 `docs/refactor-audit.md` §5 批次体系）：

```bash
# 1. 安装依赖（B0 基建已修好，macOS arm64 可装）
npm install

# 2. 初始化数据库（先复制 .env + prisma/data/ + data/uploads/）
npm run db:setup

# 3. 提交上一设备残留的改动（本会话已改：主题固化/列表卡片流/详情页/系统配置布局）
git add -A && git commit -m "refactor: B12 石墨主题 + 列表卡片流 + 详情页重构（部分）"

# 4. 验证基线
npm run lint && npx tsc --noEmit && npm run build
# 浏览器打开 http://localhost:3000/resume/list 确认卡片流、详情页新布局

# 5. 继续 B7-B11（非 UI 重构批次，见 refactor-audit.md §5）
#    B7 API 硬化 → B8 规则单点 → B9 页面拆分 → B10 组件收敛 → B11 个人化清理

# 6. 完成 B12（本文档主体）
#    按 §3 待办清单：系统配置页令牌化 → 宽度统一 → 剩余硬编码清理 → 详情页打磨 → dashboard 微调
```

- 任何一步卡住：`docs/refactor-audit.md`（原始审计）+ `.claude/skills/refactor.md`（约束）+ `docs/refactor-prompts.md`（模板）都在仓库里兜底。
- 换设备前**必须**提交或复制：`.env`、`prisma/data/`、`data/uploads/`、`public/photos/`（未提交的运行时数据）。

---

## 七、推荐迭代顺序

> 本文档对应重构批次 **B12**。若按批次推进：B7-B11（API 硬化/规则单点/页面拆分/组件收敛/个人化）优先，B12（本清单）收尾；若纯 UI 优先，可直接按下面顺序做 B12 内部项。

1. **§3.1 系统配置页令牌化 + 套 Shell**（视觉差距最大，收益最高）
2. **§3.2 宽度统一**（webhooks 3xl、reevaluate 决策）
3. **§3.3 剩余硬编码清理**（全站零残留为目标）
4. **§3.4 详情页打磨**（按用户反馈继续）
5. **§3.5 dashboard 微调**
6. **收尾**：删除演示数据、更新 README/CLAUDE.md 中「墨金·朱」旧配色描述（现在已是石墨主题）——同时检查 `docs/refactor-prompts.md` P5 模板是否还有过时配色引用
