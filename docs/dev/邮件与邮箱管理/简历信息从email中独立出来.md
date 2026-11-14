# 简历信息从 Email 中独立出来

## 一、概述

将"简历依附于邮件"的数据关系改为"简历是独立业务对象，邮件只是来源之一"。删除邮件不再删除关联简历，简历全程可溯源。

### 核心变更

| 变更项                         | 旧                      | 新                                  |
| ------------------------------ | ----------------------- | ----------------------------------- |
| Resume.emailId                 | 必填 (`String`)         | 可选 (`String?`)                    |
| 邮件-简历关系                  | 强绑定（邮件删→简历删） | 弱引用（邮件删→解除关联，简历保留） |
| 来源溯源                       | 依赖 Email 表           | 新增 3 个快照字段，邮件删了也能溯源 |
| 删除邮件行为                   | 级联删除简历 + 清理文件 | 解除关联 → 删除邮件，简历和文件保留 |
| ScreeningResult.detailAnalysis | 存在                    | 删除（S9 已移除）                   |

---

## 二、数据模型变更

### 2.1 Resume 模型变更

```prisma
model Resume {
  // ... 现有字段不变

  // === 变更：emailId 从必填改为可选 ===
  emailId              String?    // 旧：String（必填）

  // === 新增：来源快照字段（邮件删除后保留溯源信息） ===
  sourceEmailFrom      String?    // 发件人名称/地址，如 "boss@email.bosszhipin.com"
  sourceEmailSubject   String?    // 原始邮件主题
  sourceEmailReceivedAt DateTime? // 邮件收件时间

  // === 关系：email 从必填改为可选 ===
  email                Email?     @relation(fields: [emailId], references: [id])
  // 旧：Email @relation(...)（必填）
}
```

### 2.2 快照字段说明

| 字段                    | 类型        | 写入时机                | 删除邮件后 |
| ----------------------- | ----------- | ----------------------- | ---------- |
| `sourceEmailFrom`       | `String?`   | 简历创建时从 Email 填充 | 保留       |
| `sourceEmailSubject`    | `String?`   | 简历创建时从 Email 填充 | 保留       |
| `sourceEmailReceivedAt` | `DateTime?` | 简历创建时从 Email 填充 | 保留       |
| `emailId`               | `String?`   | 简历创建时赋值          | 置为 null  |
| `emailConfigId`         | `String?`   | 简历创建时赋值          | 保留不变   |
| `resumeSourceId`        | `String?`   | 简历创建时赋值          | 保留不变   |

### 2.3 存量数据迁移

所有现有简历需要通过一次性脚本回填快照字段：

```sql
-- 迁移逻辑（伪代码）
UPDATE Resume SET
  sourceEmailFrom = (SELECT fromAddress || ' ' || COALESCE(fromName, '') FROM Email WHERE Email.id = Resume.emailId),
  sourceEmailSubject = (SELECT subject FROM Email WHERE Email.id = Resume.emailId),
  sourceEmailReceivedAt = (SELECT receivedAt FROM Email WHERE Email.id = Resume.emailId)
```

迁移脚本：`scripts/backfill-resume-source-snapshot.ts`，部署时执行一次。

---

## 三、API 变更

### 3.1 删除邮件 API

**路由**：`DELETE /api/emails/[id]`

**新逻辑**：

```
1. 查找邮件，include 关联简历的 id + status
2. 检查关联简历中是否有 PARSING 或 SCREENING 状态的
   → 有：返回 409 "有 N 份简历正在处理中，请稍后重试"
   → 无：继续
3. 将所有关联简历的 emailId 置为 null
   （emailConfigId、resumeSourceId、快照字段 保持不动）
4. 删除邮件记录
5. 不删除 data/uploads/{emailId}/ 下的文件
6. 返回成功
```

**对比旧逻辑**：

| 步骤       | 旧                     | 新                                     |
| ---------- | ---------------------- | -------------------------------------- |
| 处理中检查 | 无                     | 新增，PARSING/SCREENING 时拒绝         |
| 简历处理   | `resume.deleteMany()`  | `resume.updateMany({ emailId: null })` |
| 文件处理   | `fs.rmSync(uploadDir)` | 不删除                                 |

### 3.2 Refetch API

**路由**：`POST /api/resumes/[id]/refetch`

当 `resume.emailId` 为 null 时（邮件已删），返回错误：

```json
{ "error": "原始邮件已删除，无法重新获取" }
```

### 3.3 其他 API 兼容性

以下 API 中访问 `resume.email` 的地方需要适配：

| API                            | 当前写法                | 适配                |
| ------------------------------ | ----------------------- | ------------------- |
| `resumes/[id]/reparse`         | `resume.email?.subject` | 已有 `?.`，无需改动 |
| `resumes/[id]/match-position`  | `resume.email?.subject` | 已有 `?.`，无需改动 |
| `resumes/batch-match-position` | `resume.email?.subject` | 已有 `?.`，无需改动 |
| `follow-up/export`             | `resume.email?.subject` | 已有 `?.`，无需改动 |

---

## 四、前端变更

### 4.1 邮件列表页

**文件**：`app/resume/emails/page.tsx`

删除确认弹窗文案变更：

- 旧：`确认删除该邮件？关联的简历也将被删除。`
- 新：`确认删除该邮件？关联的简历将解除关联并保留在简历库中。`

删除失败处理：新增 409 状态的提示（「有 N 份简历正在处理中，请稍后重试」）。

### 4.2 简历列表页

**文件**：`app/resume/list/page.tsx`

邮件主题列增加 fallback：

```tsx
// 旧
{
  resume.email.subject;
}

// 新
{
  resume.email?.subject || resume.sourceEmailSubject || "未知";
}
```

收件时间列：

```tsx
// 旧
{
  new Date(resume.email.receivedAt).toLocaleDateString("zh-CN");
}

// 新
{
  resume.email?.receivedAt
    ? new Date(resume.email.receivedAt).toLocaleDateString("zh-CN")
    : resume.sourceEmailReceivedAt
      ? new Date(resume.sourceEmailReceivedAt).toLocaleDateString("zh-CN")
      : "-";
}
```

### 4.3 简历详情页

**文件**：`app/resume/detail/[id]/page.tsx`

来源信息区域增加 fallback：

```tsx
// 旧
{resume.email.fromName && `${resume.email.fromName} `}
&lt;{resume.email.fromAddress}&gt;

// 新
{resume.email
  ? <>{resume.email.fromName && `${resume.email.fromName} `}&lt;{resume.email.fromAddress}&gt;</>
  : (resume.sourceEmailFrom || '未知发件人')}
```

其他字段（subject、receivedAt、messageId）同理加 `?.` + 快照 fallback。

### 4.4 已筛选页

**文件**：`app/resume/screened/page.tsx`

已有 `?.` 保护，无需改动。

### 4.5 前端查询调整

简历详情页 API（`GET /api/resumes/[id]`）的 `include` 中，`email` 已经是 optional relation，无需改动。

---

## 五、特殊逻辑

### 5.1 删除邮件时的状态检查

```
if (关联简历中存在 status IN ('PARSING', 'SCREENING')) {
  return 409 "有 N 份简历正在处理中，请稍后重试"
}
```

### 5.2 快照字段永不更新

快照字段（`sourceEmailFrom`、`sourceEmailSubject`、`sourceEmailReceivedAt`）**仅在简历首次创建时写入**，后续解析/筛选/邮件删除都不会更改它们。它们记录的是"这份简历最初是怎么进入系统的"。

### 5.3 孤立文件清理

删除邮件时不删除 `data/uploads/{emailId}/` 目录。未来通过独立脚本清理：

```bash
npx tsx scripts/cleanup-orphaned-files.ts
```

清理逻辑：遍历 `data/uploads/` 下所有目录，如果对应 emailId 在 Email 表中不存在，且没有任何 Resume 的 `filePath` 指向该目录下文件，则删除。

---

## 六、受影响文件清单

### Schema

- `prisma/schema.prisma` — Resume.emailId 可选 + 3 个快照字段

### 后端 API

- `app/api/emails/[id]/route.ts` — DELETE 逻辑重写
- `app/api/resumes/[id]/refetch/route.ts` — emailId 为 null 时返回错误

### 后端服务（`?.` 加固）

- `lib/services/parsing-worker-processor.ts` — `resume.email.subject` → `resume.email?.subject`

### 前端页面

- `app/resume/emails/page.tsx` — 删除确认文案 + 409 错误处理
- `app/resume/list/page.tsx` — 邮件列 fallback
- `app/resume/detail/[id]/page.tsx` — 来源信息 fallback

### 迁移脚本

- `scripts/backfill-resume-source-snapshot.ts` — 存量数据回填快照字段

---

## 七、验收标准

| 检查项           | 标准                                                 | 验证方式                        |
| ---------------- | ---------------------------------------------------- | ------------------------------- |
| **邮件收取简历** | 功能不受影响                                         | 手动触发 fetch 后检查新简历创建 |
| **快照字段写入** | 新收的简历 sourceEmailFrom/Subject/ReceivedAt 不为空 | Prisma Studio 查看              |
| **邮件删除**     | 删除邮件后关联简历保留，emailId 为 null              | 删除邮件后查看简历详情          |
| **处理中保护**   | 有 PARSING/SCREENING 简历时无法删除邮件              | 筛选进行中尝试删除              |
| **简历溯源**     | 邮件删了后详情页仍显示来源信息                       | 查看已删除邮件的简历详情        |
| **列表页**       | 邮件删了后列表页不报错，显示快照信息                 | 列表页查看                      |
| **Refetch**      | 邮件删了后 refetch 返回明确错误                      | 调用 refetch API                |
| **存量迁移**     | 现有简历快照字段被正确回填                           | 运行脚本后 Prisma Studio 抽查   |
| **无感知变更**   | 邮件未删除时所有页面的展示和功能完全不变             | 手动测试各页面                  |

---

## 八、实施计划

| 步骤 | 内容                                                           | 预计顺序 |
| ---- | -------------------------------------------------------------- | -------- |
| 1    | 运行 `scripts/backfill-resume-source-snapshot.ts` 回填存量数据 | 1        |
| 2    | 修改 `prisma/schema.prisma`                                    | 2        |
| 3    | `npx prisma db push` + `npx prisma generate`                   | 3        |
| 4    | 改造 DELETE API                                                | 4        |
| 5    | 改造 refetch API                                               | 5        |
| 6    | 加固 parsing-worker-processor                                  | 6        |
| 7    | 改造前端 3 个页面                                              | 7        |
| 8    | 端到端验收测试                                                 | 8        |

## 九、风险评估

| 风险                                  | 概率 | 影响 | 缓解措施                                              |
| ------------------------------------- | ---- | ---- | ----------------------------------------------------- |
| 存量迁移时 FK 约束冲突                | 低   | 高   | 迁移脚本先回填快照，再改 schema                       |
| 遗漏 `.email` 访问导致 undefined 错误 | 中   | 中   | 已全局排查，清单见第六节                              |
| SQLite 不支持 ALTER COLUMN            | 中   | 低   | `prisma db push` 自动处理（重建表），数据量小时无风险 |
| 删除邮件后文件目录残留                | 低   | 低   | 后续清理脚本兜底                                      |
