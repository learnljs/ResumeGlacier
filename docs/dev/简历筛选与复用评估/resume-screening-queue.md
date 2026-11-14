# 简历筛选异步队列优化

## Context

简历筛选过程调用 AI 大模型，存在明显延时（10-30s/份）。当前批量筛选是同步阻塞的——HTTP 请求一直挂起直到所有简历处理完毕，导致前端长时间等待甚至超时。需要将筛选逻辑改为异步队列处理，提升用户体验。

**核心目标**：
1. 筛选操作（批量+单个）仅针对 PENDING 状态，触发后立即变为 SCREENING
2. 新增"正在筛选"选项卡，支持自动/手动刷新
3. 所有筛选任务放入唯一的后台队列顺序处理，API 立即返回

## 实现方案

### 1. 创建筛选队列单例

**新建文件**: `lib/services/screening-queue.ts`

使用 `globalThis` 单例模式（与 `lib/prisma.ts` 一致），实现 `ScreeningQueue` 类：

```typescript
class ScreeningQueue {
  private queue: Array<{resumeId: string, aiConfigId?: string}> = []
  private processing = false
  private currentResumeId: string | null = null
  private initialized = false

  async enqueue(items: Array<{resumeId: string, aiConfigId?: string}>): Promise<void>
  private async processLoop(): Promise<void>
  private async recoverOrphans(): Promise<void>
  getStatus(): {queueLength: number, isProcessing: boolean, currentResumeId: string | null}
}
```

**关键行为**：
- `enqueue()`: 添加项到队列，首次调用时执行孤儿恢复（查找 SCREENING 状态的简历重新入队），若未在处理中则启动 `processLoop()`
- `processLoop()`: 循环取出队列项，调用现有的 `screenResume()` 处理，每项之间 1s 延迟，错误时将简历状态设为 ERROR 并继续下一项
- `recoverOrphans()`: 首次 enqueue 时运行一次，查询所有 status=SCREENING 且不在队列中的简历，重新入队
- 队列上限 500，超出时拒绝入队

**单例挂载**：
```typescript
const globalForQueue = globalThis as unknown as { screeningQueue: ScreeningQueue | undefined }
export const screeningQueue = globalForQueue.screeningQueue ?? new ScreeningQueue()
if (process.env.NODE_ENV !== 'production') globalForQueue.screeningQueue = screeningQueue
```

### 2. 修改批量筛选 API

**文件**: `app/api/resumes/batch-screen/route.ts`

当前逻辑：调用 `batchScreenResumes()` 同步等待所有结果返回。

**改为**：
1. 从请求体获取 `{ids?, aiConfigId?}`
2. 查询匹配的 PENDING 简历（复用现有查询条件：status=PENDING, extractedText!=null, positionId!=null）
3. 用 `prisma.resume.updateMany()` 批量设置状态为 SCREENING
4. 调用 `screeningQueue.enqueue(items)`
5. 立即返回 `{queued: N}` (HTTP 200)

### 3. 修改单个筛选 API

**文件**: `app/api/resumes/[id]/screen/route.ts`

当前逻辑：调用 `screenResume()` 同步等待 AI 结果返回。

**改为**：
1. 从请求体获取 `{positionId?, aiConfigId?}`
2. 查询简历，校验状态：
   - 仅允许 PENDING 状态触发筛选
   - 非 PENDING 状态 → 返回 `{error: "只有待筛选状态的简历才能进行筛选"}` (400)
3. 校验 extractedText 非空、position 已分配
4. 设置状态为 SCREENING（如有 positionId 更新一并处理）
5. 如有旧的 screeningResult，先删除
6. 调用 `screeningQueue.enqueue([{resumeId, aiConfigId}])`
7. 返回 `{queued: true}` (HTTP 200)

### 4. 清理 ai-screener.ts

**文件**: `lib/services/ai-screener.ts`

- 删除 `batchScreenResumes()` 函数（不再被调用）
- `screenResume()` 保持不变——仍然是核心筛选逻辑，由队列的 `processLoop()` 调用

### 5. 前端：简历列表页增加"正在筛选"选项卡

**文件**: `app/resume/list/page.tsx`

#### 5a. 新增 tab

```
validTabs: ['all', 'pending', 'screening', 'unassigned', 'screened']
```

tab 按钮数组新增 `{ key: 'screening', label: '正在筛选' }`。

#### 5b. loadResumes 中新增 screening tab 的过滤逻辑

```typescript
else if (activeTab === 'screening') {
  params.set('status', 'SCREENING')
}
```

同时让 screening tab 也支持 positionId 筛选（与 pending/screened 一致）。

#### 5c. 自动刷新

新增 `useEffect`：当 `activeTab === 'screening'` 时，每 3 秒调用 `loadResumes()`。
- 监听 `document.visibilityState`，页面不可见时暂停
- tab 切换或组件卸载时清除定时器

#### 5d. 修改 handleBatchScreen

- API 现在立即返回 `{queued: N}`
- toast 改为 `"已提交 ${json.queued} 份简历到筛选队列"`
- 提交成功后自动切换到 `screening` tab

### 6. 前端：简历详情页异步筛选

**文件**: `app/resume/detail/[id]/page.tsx`

#### 6a. 修改 handleScreen

- API 返回 `{queued: true}` 后，toast 改为 `"已提交AI筛选，请等待处理..."`
- 调用 `loadResume()` 刷新页面（状态变为 SCREENING）

#### 6b. 新增轮询 effect

当 `resume?.status === 'SCREENING'` 时，每 **10 秒**调用 `loadResume()`。当状态不再是 SCREENING 时停止轮询：
- 若变为 PASSED/FAILED → toast `"AI筛选完成"`
- 若变为 ERROR → toast `"AI筛选出错"`
- 清除定时器

#### 6c. 按钮状态调整——仅 PENDING 可点击

"开始AI筛选"按钮**仅在简历状态为 PENDING 时可点击**，其他所有状态均禁用：
- disabled 条件改为：`screening || !resume.position || resume.status !== 'PENDING'`
- 当 `resume.status === 'SCREENING'` 时按钮显示旋转图标和"筛选中..."
- 当状态为 PASSED/FAILED 时按钮显示"已筛选"（灰色不可点击）
- 移除原有的"重新筛选"逻辑（不再允许从 PASSED/FAILED 状态重新触发筛选）

## 需要修改的文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `lib/services/screening-queue.ts` | **新建** | 队列单例，核心模块 |
| `app/api/resumes/batch-screen/route.ts` | **重写** | 改为异步入队+立即返回 |
| `app/api/resumes/[id]/screen/route.ts` | **重写** | 改为异步入队+立即返回 |
| `lib/services/ai-screener.ts` | **修改** | 删除 `batchScreenResumes()` |
| `app/resume/list/page.tsx` | **修改** | 新增 screening tab + 自动刷新 + 更新 batch handler |
| `app/resume/detail/[id]/page.tsx` | **修改** | 异步筛选 + 轮询状态 |

## 验证方案

1. **启动项目**：`npm run dev`
2. **批量筛选测试**：
   - 在列表页选择多个 PENDING 状态简历，点击"批量AI筛选"
   - 验证 API 立即返回，toast 显示入队数量
   - 自动跳转到"正在筛选" tab
   - 观察列表中简历状态从 SCREENING 逐步变为 PASSED/FAILED
   - 自动刷新每 3 秒生效
3. **单个筛选测试**：
   - 进入 PENDING 状态简历的详情页，点击"开始AI筛选"
   - 验证按钮立即变为 loading 状态，toast 提示已提交
   - 验证页面刷新后简历状态变为 SCREENING，按钮显示"筛选中..."且不可点击
   - 等待轮询（每 10 秒）检测到筛选完成，页面自动刷新显示结果
   - 验证 PASSED/FAILED/SCREENING/ERROR 状态的简历详情页，"开始AI筛选"按钮均不可点击
4. **队列顺序测试**：
   - 快速连续触发多次筛选（批量+单个混合）
   - 验证所有任务依次执行，不并发
5. **错误恢复**：
   - 在筛选进行中重启 dev server
   - 触发新的筛选操作
   - 验证之前 SCREENING 状态的简历被重新入队处理
6. **按钮状态测试**：
   - PENDING 状态 + 已分配职位 → 按钮可点击，显示"开始AI筛选"
   - PENDING 状态 + 未分配职位 → 按钮不可点击
   - SCREENING 状态 → 按钮不可点击，显示"筛选中..."
   - PASSED/FAILED 状态 → 按钮不可点击，显示"已筛选"
   - ERROR 状态 → 按钮不可点击
