# 跟进管理模块 SPEC

## 概述

为简历智能筛选系统新增「跟进管理」模块，支持对已筛选简历打标签跟进、集中管理跟进记录、高级筛选与数据导出。

---

## 1. 数据库模型

### 1.1 FollowUpTag（跟进标签）

| 字段      | 类型     | 说明                     |
| --------- | -------- | ------------------------ |
| id        | String   | 主键，cuid 自动生成      |
| name      | String   | 标签名称，唯一约束       |
| color     | String   | 标签颜色，默认 `#3b82f6` |
| createdAt | DateTime | 创建时间                 |

### 1.2 FollowUpRecord（跟进记录）

| 字段      | 类型     | 说明                          |
| --------- | -------- | ----------------------------- |
| id        | String   | 主键，cuid 自动生成           |
| resumeId  | String   | 关联简历 ID（外键 -> Resume） |
| note      | String?  | 跟进备注，可选                |
| createdAt | DateTime | 创建时间                      |
| updatedAt | DateTime | 更新时间                      |

### 1.3 FollowUpRecordTag（跟进记录-标签关联，多对多）

| 字段             | 类型   | 说明                                 |
| ---------------- | ------ | ------------------------------------ |
| id               | String | 主键                                 |
| followUpRecordId | String | 外键 -> FollowUpRecord，级联删除     |
| followUpTagId    | String | 外键 -> FollowUpTag，级联删除        |

联合唯一约束：`(followUpRecordId, followUpTagId)`

### 1.4 Resume 模型变更

- 新增关联字段 `followUpRecords: FollowUpRecord[]`

---

## 2. API 接口

### 2.1 标签管理

**GET /api/follow-up/tags**
- 返回所有标签列表（含引用计数）

**POST /api/follow-up/tags**
- 请求体：`{ name: string, color?: string }`
- 创建新标签，名称唯一校验

### 2.2 跟进记录管理

**GET /api/follow-up/records**
- 查询参数：`page`, `pageSize`, `search`, `tagIds`（逗号分隔）, `tagLogic`（OR|AND）, `positionId`, `status`, `resumeSourceId`, `scoreMin`, `scoreMax`, `dateFrom`, `dateTo`
- 返回分页跟进记录，包含关联的标签、简历、职位、筛选结果等信息

**POST /api/follow-up/records**
- 请求体：`{ resumeId: string, tagIds: string[], note?: string }`
- 创建跟进记录，至少选择一个标签

**DELETE /api/follow-up/records/[id]**
- 删除指定跟进记录（级联删除关联标签）

### 2.3 数据导出

**GET /api/follow-up/export**
- 返回所有可导出字段配置

**POST /api/follow-up/export**
- 请求体：`{ fields: string[], ...筛选参数 }`
- 导出 CSV 文件（UTF-8 BOM 编码，兼容 Excel）
- 可导出字段：候选人姓名、联系电话、联系邮箱、应聘职位、简历来源、简历状态、AI评分、筛选结论、AI摘要、跟进标签、跟进备注、跟进日期、邮件主题、接收时间

### 2.4 简历列表 API 变更

**GET /api/resumes**
- 新增查询参数 `followUp`：`YES`（已跟进）| `NO`（未跟进）
- 返回数据新增 `followUpRecords` 字段（最新一条跟进记录及其标签）

---

## 3. 前端页面

### 3.1 左侧导航栏

- 新增「跟进管理」入口（UserCheck 图标），路由 `/resume/follow-up`
- 位于「简历列表」下方

### 3.2 简历列表页变更（/resume/list）

#### 3.2.1 跟进状态列
- 新增独立「跟进」列（位于「状态」列之后）
- 显示最近一次跟进记录的标签（彩色圆角标签）
- 未跟进显示 `-`

#### 3.2.2 跟进状态筛选
- 筛选表单新增「全部跟进 / 已跟进 / 未跟进」下拉框
- 通过 API 的 `followUp` 参数实现服务端筛选

#### 3.2.3 已筛选选项卡操作列
- 新增「跟进」按钮，点击打开跟进对话框
- 已跟进的简历不显示「跟进」按钮
- 移除「解析」按钮（已筛选 tab 不需要）

#### 3.2.4 联系方式列合并
- 已筛选 tab 的「联系电话」和「联系邮箱」合并为「联系方式」列
- 上方显示电话（正常字号），下方显示邮箱（小字号灰色）
- 各自保留独立复制按钮

#### 3.2.5 表格样式调整
- 候选人列只显示姓名和复制按钮，移除文件名
- 所有表头居中显示，加 `whitespace-nowrap` 防换行
- 表格内容默认居中（`text-center`）
- 复制功能使用 `navigator.clipboard?.writeText()` 可选链，兼容非 HTTPS 环境

### 3.3 跟进对话框（FollowUpDialog 组件）

- 弹出式对话框，显示候选人姓名
- 已有标签列表，支持多选（点击切换选中状态，选中高亮）
- 新增标签功能：输入名称 + 选择颜色（10 种预设色），创建后自动选中
- 已选标签预览区，点击可取消选择
- 可选备注输入框
- 提交：至少选择一个标签，调用 POST /api/follow-up/records

### 3.4 跟进管理页面（/resume/follow-up）

#### 3.4.1 基础筛选
- 搜索框：支持按候选人姓名、邮箱、电话搜索
- 标签快速筛选：显示所有标签，点击切换选中
- 多标签逻辑切换：选中 2 个以上标签时显示 OR/AND 切换按钮

#### 3.4.2 高级筛选（可折叠面板）
- 标签多选筛选：支持多标签选择，OR/AND 逻辑切换
- 职位多选筛选：支持同时选择多个职位进行过滤
- 日期范围筛选：跟进创建时间范围
- 联系结果筛选（仅沟通中 Tab）
- **筛选按钮机制**：筛选条件的变更仅更新本地草稿状态，不立即生效。需点击「筛选」按钮后，草稿状态写入 URL 并触发数据加载
- 清除筛选按钮：一键清空所有草稿筛选条件并立即生效

#### 3.4.3 数据表格
- 列：候选人、标签、职位、状态、评分、备注、跟进时间、操作
- 操作：查看（跳转简历详情，携带 `from` 参数保持筛选状态）、取消跟进（红色，调用 DELETE API）
- 分页

#### 3.4.4 数据导出
- 导出设置对话框：可自定义选择导出字段（全选/取消全选）
- 根据当前筛选条件导出
- 输出格式：CSV（UTF-8 BOM）

---

## 4. 涉及文件清单

### 新增文件

| 文件路径                                        | 说明             |
| ----------------------------------------------- | ---------------- |
| app/api/follow-up/tags/route.ts                 | 标签 CRUD API    |
| app/api/follow-up/records/route.ts              | 跟进记录 API     |
| app/api/follow-up/records/[id]/route.ts         | 跟进记录删除 API |
| app/api/follow-up/export/route.ts               | 数据导出 API     |
| app/resume/follow-up/page.tsx                   | 跟进管理页面     |
| components/resume/FollowUpDialog.tsx            | 跟进对话框组件   |

### 修改文件

| 文件路径                      | 修改内容                                         |
| ----------------------------- | ------------------------------------------------ |
| prisma/schema.prisma          | 新增 3 个模型，Resume 增加关联                   |
| app/api/resumes/route.ts      | 增加 followUp 筛选参数，返回 followUpRecords     |
| app/resume/layout.tsx         | 导航栏增加「跟进管理」入口                       |
| app/resume/list/page.tsx      | 跟进列、筛选、对话框、联系方式合并、样式调整等   |
| app/api/follow-up/records/route.ts | 职位筛选参数从 `positionId`（单选）改为 `positionIds`（多选，`in` 过滤） |
| app/api/follow-up/export/route.ts  | 同步改为 `positionIds` 多选过滤                   |
| app/resume/follow-up/page.tsx | 职位筛选改用 MultiSelect 多选组件；引入本地草稿状态（筛选条件不立即生效）；增加筛选按钮 |
