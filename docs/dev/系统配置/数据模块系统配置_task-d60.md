# 数据模块系统配置

## 任务 1：创建获取数据库 Schema 信息的 API

**文件**: `app/api/config/database/schema/route.ts`

- 后端通过 Prisma `$queryRaw` 查询 SQLite `PRAGMA table_info` 获取所有表的字段信息（字段名、类型、是否可为空、默认值等）
- 使用 `SELECT name FROM sqlite_master WHERE type='table'` 获取所有表名（排除 sqlite_ 系统表和 _prisma_migrations）
- 通过解析 `prisma/schema.prisma` 文件获取每个字段的注释（`///` 注释行），构建字段名到注释的映射
- 返回结构: `{ tables: [{ name, fields: [{ name, type, nullable, defaultValue, comment }] }] }`

## 任务 2：创建只读 SQL 查询 API

**文件**: `app/api/config/database/query/route.ts`

- POST 接收 `{ sql: string }` 参数
- **安全校验**:
  - 白名单检查：SQL 必须以 `SELECT` 开头（去除前后空白后，大小写不敏感）
  - 禁止关键词黑名单：检查 SQL 中不包含 `INSERT`、`UPDATE`、`DELETE`、`DROP`、`ALTER`、`CREATE`、`TRUNCATE`、`REPLACE`、`ATTACH`、`DETACH`、`PRAGMA` 等非查询语句关键词（使用正则单词边界匹配）
  - 禁止多语句：检查不包含分号 `;`（排除结尾分号）
- 使用 Prisma `$queryRawUnsafe` 执行只读查询
- 限制返回行数（最多 2000 行，分页由前端处理）
- 返回结构: `{ columns: string[], rows: any[], rowCount: number }` 或错误信息

## 任务 3：扩展分页组件支持自定义每页条数选项

**文件**: `components/ui/pagination.tsx`

- 新增可选 prop `pageSizeOptions?: { value: number; label: string }[]`
- 默认值保持 `[{ value: 10, label: '10条/页' }, { value: 15, label: '15条/页' }, { value: 20, label: '20条/页' }]`
- 当传入自定义选项时覆盖默认选项
- 注意：如果 `totalPages <= 1` 时直接 `return null`，在数据模块中需要改为即使只有 1 页也显示分页栏（因为需要显示每页条数选择器）——通过新增可选 prop `alwaysShow?: boolean` 实现，默认 `false`

## 任务 4：创建前端数据模块页面

**文件**: `app/resume/system-config/database/page.tsx`

- 左右两栏布局（左侧固定宽度 ~320px，右侧自适应）
- **左侧 - Schema 树**:
  - 使用递归树形组件展示表/字段层级
  - 表节点可展开/折叠，带数据库图标
  - 字段节点显示: 字段名（粗体）+ 类型（灰色badge）+ 注释（灰色斜体，如有）
  - 支持搜索过滤表名/字段名
  - 使用 `Database`、`Table`、`Columns` 等 lucide-react 图标
- **右侧 - SQL 查询区**:
  - 上半部分：`<textarea>` 多行输入框，placeholder 提示示例 SQL
  - "运行"按钮，带 loading 状态
  - 快捷键支持：Cmd/Ctrl + Enter 触发执行
  - 下半部分：查询结果表格
    - 成功时显示列名表头 + 数据行，支持横向滚动
    - 使用前端分页：默认 pageSize=20，每页条数选项为 [10, 20, 50, 100]
    - 底部使用现有 `<Pagination>` 组件，传入 `alwaysShow={true}`、`pageSizeOptions`
    - 显示总行数、当前页/总页数统计
    - 错误时显示红色错误提示

## 任务 5：更新系统配置布局

**文件**: `app/resume/system-config/layout.tsx`

- 在 tabs 数组中新增 `{ href: '/resume/system-config/database', label: '数据模块', icon: Database }`（从 lucide-react 导入 `Database` 图标）
