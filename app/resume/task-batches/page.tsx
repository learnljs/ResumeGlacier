'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Download,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  User,
  Calendar,
  Activity,
  TrendingUp,
  Zap,
  Trash2,
  RotateCcw,
  StopCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import { SegmentedProgress } from '@/components/ui/segmented-progress'
import { formatMonthDayTime, formatDateTimeFull } from '@/lib/utils/date'

interface BatchEmailConfig {
  id: string
  alias: string
  user: string
}

interface TaskBatch {
  id: string
  batchNo: string
  source: string
  sourceDetail: string | null
  emailConfigId: string | null
  emailConfig: BatchEmailConfig | null
  totalResumes: number
  parsedCount: number
  screenedCount: number
  errorCount: number
  screenErrorCount: number
  screeningCount: number
  status: string
  startedAt: string
  completedAt: string | null
  createdAt: string
  progress: {
    parsing: number
    screening: number
  }
}

interface BatchResumeItem {
  id: string
  fileName: string
  candidateName: string | null
  status: string
  errorMessage: string | null
  createdAt: string
}

interface BatchDetail extends TaskBatch {
  resumes: BatchResumeItem[]
  resumesPagination?: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode; bgColor: string }> = {
  processing: {
    label: '进行中',
    color: 'text-info',
    bgColor: 'bg-info/10 border-info/30',
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  },
  completed: {
    label: '已完成',
    color: 'text-success',
    bgColor: 'bg-success/10 border-success/30',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
}

export default function TaskBatchesPage() {
  const [batches, setBatches] = useState<TaskBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null)
  const [batchDetail, setBatchDetail] = useState<BatchDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [stoppingId, setStoppingId] = useState<string | null>(null)
  const loadBatchesRef = useRef<(() => Promise<void>) | null>(null)

  const loadBatches = useCallback(async () => {
    try {
      const response = await fetch('/api/task-batches?limit=10')
      if (!response.ok) {
        throw new Error('获取批次列表失败')
      }
      const data = await response.json()
      setBatches(data.batches || [])
    } catch (error) {
      console.error('加载批次列表失败:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBatchesRef.current = loadBatches
  }, [loadBatches])

  useEffect(() => {
    loadBatches()

    const interval = setInterval(() => {
      loadBatchesRef.current?.()
    }, 3000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadBatchesRef.current?.()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const loadBatchDetail = async (batchId: string) => {
    setLoadingDetail(true)
    try {
      const response = await fetch(`/api/task-batches/${batchId}?includeResumes=true`)
      if (!response.ok) {
        throw new Error('获取批次详情失败')
      }
      const data = await response.json()
      setBatchDetail(data.batch)
    } catch (error) {
      console.error('加载批次详情失败:', error)
      toast.error('加载批次详情失败')
    } finally {
      setLoadingDetail(false)
    }
  }

  const toggleBatchExpand = (batchId: string) => {
    if (expandedBatchId === batchId) {
      setExpandedBatchId(null)
      setBatchDetail(null)
    } else {
      setExpandedBatchId(batchId)
      loadBatchDetail(batchId)
    }
  }

  const handleManualFetch = async () => {
    setFetching(true)
    try {
      const response = await fetch('/api/emails/fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ autoProcess: true }),
      })

      if (!response.ok) {
        throw new Error('邮件获取失败')
      }

      const data = await response.json()

      if (data.batchId) {
        toast.success(`邮件获取完成，新批次 ${data.batchNo} 已创建，共 ${data.total.generated} 份简历`)
      } else if (data.total.generated === 0) {
        toast.info('没有新的简历需要处理')
      }

      loadBatches()
    } catch (error) {
      console.error('手动获取邮件失败:', error)
      toast.error('邮件获取失败，请重试')
    } finally {
      setFetching(false)
    }
  }

  const handleDelete = async (batchId: string) => {
    if (!(await confirmDialog({
      title: '删除此批次？',
      description: '关联的简历不会被删除，只会解除与批次的关联。',
      confirmText: '删除',
      destructive: true,
    }))) {
      return
    }

    setDeletingId(batchId)
    try {
      const response = await fetch(`/api/task-batches/${batchId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '删除失败')
      }

      toast.success('批次已删除')
      loadBatches()
    } catch (error) {
      console.error('删除批次失败:', error)
      const message = error instanceof Error ? error.message : '删除批次失败'
      toast.error(message)
    } finally {
      setDeletingId(null)
    }
  }

  const handleStop = async (batchId: string) => {
    if (!(await confirmDialog({
      title: '停止此批次？',
      description: '处理中的简历将被重置为初始状态。',
      confirmText: '停止',
      destructive: true,
    }))) {
      return
    }

    setStoppingId(batchId)
    try {
      const response = await fetch(`/api/task-batches/${batchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '停止失败')
      }

      toast.success('批次已停止')
      loadBatches()
    } catch (error) {
      console.error('停止批次失败:', error)
      const message = error instanceof Error ? error.message : '停止批次失败'
      toast.error(message)
    } finally {
      setStoppingId(null)
    }
  }

  // 时间格式化单点在 lib/utils/date（B8-4）

  const getSourceLabel = (source: string, sourceDetail: string | null) => {
    if (source === 'scheduled') {
      return sourceDetail || '定时任务'
    }
    if (source === 'rescreen') {
      return sourceDetail || '重新筛选'
    }
    if (source === 'parse') {
      return sourceDetail || '批量解析'
    }
    return sourceDetail || '手动获取'
  }

  const getSourceBadge = (source: string) => {
    if (source === 'rescreen') {
      return (
        <Badge variant="outline" className="bg-accent/10 text-accent border-accent/30">
          筛选任务
        </Badge>
      )
    }
    if (source === 'parse') {
      return (
        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
          解析任务
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="bg-info/10 text-info border-info/30">
        获取任务
      </Badge>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">任务管理</h2>
            <p className="text-sm text-muted-foreground mt-0.5">管理邮件获取和简历处理任务</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => loadBatches()}
            disabled={loading}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button
            onClick={handleManualFetch}
            disabled={fetching}
            size="sm"
            className="gap-2"
          >
            {fetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {fetching ? '获取中...' : '手动获取'}
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      {batches.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* 已完成批次 */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">已完成批次</p>
                  <p className="text-2xl font-bold mt-1">
                    {batches.filter((b) => b.status === 'completed').length}
                  </p>
                </div>
                <div className="p-2 bg-success/10 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 处理中批次 */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">处理中批次</p>
                  <p className="text-2xl font-bold mt-1">
                    {batches.filter((b) => b.status === 'processing').length}
                  </p>
                </div>
                <div className="p-2 bg-warning/10 rounded-lg">
                  <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 异常总数 */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">异常总数</p>
                  <p className="text-2xl font-bold mt-1">
                    {batches.reduce((sum, b) => sum + b.errorCount + b.screenErrorCount, 0)}
                  </p>
                </div>
                <div className="p-2 bg-destructive/10 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 总简历数 */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">总简历数</p>
                  <p className="text-2xl font-bold mt-1">
                    {batches.reduce((sum, b) => sum + b.totalResumes, 0)}
                  </p>
                </div>
                <div className="p-2 bg-violet-50 rounded-lg">
                  <FileText className="h-5 w-5 text-violet-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 批次列表 */}
      {batches.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="p-4 bg-muted rounded-full mb-4">
              <FileText className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">暂无任务批次</h3>
            <p className="text-muted-foreground text-sm mb-6 max-w-md text-center">
              点击"手动获取"按钮或等待定时任务执行后，将在这里显示任务批次
            </p>
            <Button onClick={handleManualFetch} disabled={fetching} className="gap-2">
              {fetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              开始获取邮件
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {batches.map((batch, index) => {
            const isExpanded = expandedBatchId === batch.id
            const statusInfo = statusConfig[batch.status] || statusConfig.processing
            const isProcessing = batch.status === 'processing'
            // 解析进度：已解析 / 解析中 / 失败三段；筛选进度以可筛选数为分母
            const parsePending = Math.max(0, batch.totalResumes - batch.parsedCount - batch.errorCount)
            const parsePct =
              batch.totalResumes > 0 ? Math.round((batch.parsedCount / batch.totalResumes) * 100) : 0
            const screenBase = batch.source === 'rescreen' ? batch.totalResumes : batch.parsedCount
            const screenPending = Math.max(0, screenBase - batch.screenedCount - batch.screenErrorCount)
            const screenPct = screenBase > 0 ? Math.round((batch.screenedCount / screenBase) * 100) : 0

            return (
              <Card
                key={batch.id}
                className={`overflow-hidden transition-all duration-200 hover:shadow-md ${
                  isExpanded ? 'ring-2 ring-primary/20' : ''
                }`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* 批次头部 */}
                <div
                  className="p-4 cursor-pointer select-none"
                  onClick={() => toggleBatchExpand(batch.id)}
                >
                  <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap sm:gap-4">
                    {/* 左侧状态指示器 */}
                    <div className={`p-2.5 rounded-lg ${statusInfo.bgColor} border`}>
                      {statusInfo.icon}
                    </div>

                    {/* 中间内容：窄屏独占一行，避免被右侧按钮挤窄 */}
                    <div className="order-3 w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
                      {/* 第一行：批次编号、状态、来源 */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-foreground">
                          #{batch.batchNo}
                        </span>
                        {getSourceBadge(batch.source)}
                        <Badge variant="outline" className={`${statusInfo.bgColor} ${statusInfo.color} border`}>
                          {statusInfo.label}
                        </Badge>
                        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                          {batch.source === 'scheduled' ? (
                            <Clock className="h-3.5 w-3.5" />
                          ) : batch.source === 'rescreen' ? (
                            <Zap className="h-3.5 w-3.5" />
                          ) : batch.source === 'parse' ? (
                            <RotateCcw className="h-3.5 w-3.5" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          {getSourceLabel(batch.source, batch.sourceDetail)}
                        </span>
                        {batch.emailConfig && (
                          <span className="text-sm text-muted-foreground px-2 py-0.5 bg-muted rounded">
                            {batch.emailConfig.alias || batch.emailConfig.user}
                          </span>
                        )}
                      </div>

                      {/* 第二行：分段进度条（已解析 / 解析中 / 失败同条展示构成） */}
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
                        {/* 解析进度 - 仅获取批次显示 */}
                        {batch.source !== 'rescreen' && (
                          <div className="flex min-w-0 flex-1 items-center gap-2.5">
                            <span className="w-8 shrink-0 text-xs font-medium text-muted-foreground">解析</span>
                            <SegmentedProgress
                              total={batch.totalResumes}
                              segments={[
                                { value: batch.parsedCount, className: 'bg-success' },
                                {
                                  value: isProcessing ? parsePending : 0,
                                  className: 'bg-info/70',
                                  pulse: true,
                                },
                                { value: batch.errorCount, className: 'bg-destructive' },
                              ]}
                            />
                            <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums">
                              <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
                                {parsePct}%
                              </span>
                              <span className="hidden text-muted-foreground sm:inline">
                                {batch.parsedCount}/{batch.totalResumes}
                              </span>
                            </span>
                          </div>
                        )}

                        {/* 筛选进度 - 解析批次不显示 */}
                        {batch.source !== 'parse' && (
                          <div className="flex min-w-0 flex-1 items-center gap-2.5">
                            <span className="w-8 shrink-0 text-xs font-medium text-muted-foreground">筛选</span>
                            <SegmentedProgress
                              total={screenBase}
                              segments={[
                                { value: batch.screenedCount, className: 'bg-success' },
                                {
                                  value: isProcessing ? screenPending : 0,
                                  className: 'bg-info/70',
                                  pulse: true,
                                },
                                { value: batch.screenErrorCount, className: 'bg-destructive' },
                              ]}
                            />
                            <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums">
                              <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
                                {screenPct}%
                              </span>
                              <span className="hidden text-muted-foreground sm:inline">
                                {batch.screenedCount}/{screenBase}
                              </span>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* 第三行：状态信息 */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatMonthDayTime(batch.startedAt)}
                        </span>

                        {/* 解析中 - 仅获取批次显示 */}
                        {batch.source !== 'rescreen' && batch.status === 'processing' && batch.parsedCount + batch.errorCount < batch.totalResumes && (
                          <span className="text-info flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            解析中 {batch.totalResumes - batch.parsedCount - batch.errorCount}
                          </span>
                        )}

                        {/* 解析失败 - 获取批次和解析批次显示 */}
                        {batch.source !== 'rescreen' && batch.errorCount > 0 && (
                          <span className="text-destructive flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            失败 {batch.errorCount}
                          </span>
                        )}

                        {/* 筛选中 - 解析批次不显示 */}
                        {batch.source !== 'parse' && batch.status === 'processing' && batch.screeningCount > 0 && (
                          <span className="text-info flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            筛选中 {batch.screeningCount}
                          </span>
                        )}

                        {/* 筛选异常 - 解析批次不显示 */}
                        {batch.source !== 'parse' && batch.screenErrorCount > 0 && (
                          <span className="text-destructive flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            异常 {batch.screenErrorCount}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 右侧按钮 */}
                    <div className="order-2 ml-auto flex shrink-0 items-center gap-1.5 sm:order-none sm:ml-0">
                      {/* 停止按钮 - 仅处理中显示 */}
                      {batch.status === 'processing' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-lg text-muted-foreground hover:bg-warning/10 hover:text-warning active:bg-warning/20 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleStop(batch.id)
                          }}
                          disabled={stoppingId === batch.id}
                          title="停止批次"
                        >
                          {stoppingId === batch.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <StopCircle className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      {/* 删除按钮 - 处理中禁用 */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:bg-destructive/20 disabled:opacity-40 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(batch.id)
                        }}
                        disabled={deletingId === batch.id || batch.status === 'processing'}
                        title="删除批次"
                      >
                        {deletingId === batch.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-lg text-foreground hover:bg-muted/50 hover:text-foreground active:bg-muted transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleBatchExpand(batch.id)
                        }}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* 展开的详情 - 只显示统计信息 */}
                {isExpanded && (
                  <div className="border-t bg-muted/30">
                    {loadingDetail ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : batchDetail && batchDetail.id === batch.id ? (
                      <div className="p-4">
                        {/* 统计卡片 - 根据批次类型显示不同内容 */}
                        <div className={`grid grid-cols-2 gap-4 mb-4 ${batch.source === 'rescreen' ? 'md:grid-cols-3' : batch.source === 'parse' ? 'md:grid-cols-3' : 'md:grid-cols-4'}`}>
                          {/* 解析任务：解析总数、解析成功、解析失败 */}
                          {batch.source === 'parse' && (
                            <>
                              <div className="bg-background rounded-lg p-3 border">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 bg-info/10 rounded">
                                    <FileText className="h-4 w-4 text-blue-500" />
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">解析总数</p>
                                    <p className="text-lg font-semibold">{batchDetail.totalResumes}</p>
                                  </div>
                                </div>
                              </div>
                              <div className="bg-background rounded-lg p-3 border">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 bg-success/10 rounded">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">解析成功</p>
                                    <p className="text-lg font-semibold">{batchDetail.parsedCount}</p>
                                  </div>
                                </div>
                              </div>
                              <div className="bg-background rounded-lg p-3 border">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 bg-destructive/10 rounded">
                                    <AlertCircle className="h-4 w-4 text-destructive" />
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">解析失败</p>
                                    <p className="text-lg font-semibold">{batchDetail.errorCount}</p>
                                  </div>
                                </div>
                              </div>
                            </>
                          )}

                          {/* 获取任务：解析成功、解析失败、筛选通过、筛选异常 */}
                          {batch.source !== 'rescreen' && batch.source !== 'parse' && (
                            <>
                              <div className="bg-background rounded-lg p-3 border">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 bg-success/10 rounded">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">解析成功</p>
                                    <p className="text-lg font-semibold">{batchDetail.parsedCount}</p>
                                  </div>
                                </div>
                              </div>
                              <div className="bg-background rounded-lg p-3 border">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 bg-destructive/10 rounded">
                                    <AlertCircle className="h-4 w-4 text-destructive" />
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">解析失败</p>
                                    <p className="text-lg font-semibold">{batchDetail.errorCount}</p>
                                  </div>
                                </div>
                              </div>
                              <div className="bg-background rounded-lg p-3 border">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 bg-success/10 rounded">
                                    <TrendingUp className="h-4 w-4 text-success" />
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">筛选通过</p>
                                    <p className="text-lg font-semibold">{batchDetail.screenedCount - batchDetail.screenErrorCount}</p>
                                  </div>
                                </div>
                              </div>
                              <div className="bg-background rounded-lg p-3 border">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 bg-warning/10 rounded">
                                    <AlertCircle className="h-4 w-4 text-warning" />
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">筛选异常</p>
                                    <p className="text-lg font-semibold">{batchDetail.screenErrorCount}</p>
                                  </div>
                                </div>
                              </div>
                            </>
                          )}

                          {/* 筛选任务：筛选总数、筛选通过、筛选异常 */}
                          {batch.source === 'rescreen' && (
                            <>
                              <div className="bg-background rounded-lg p-3 border">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 bg-info/10 rounded">
                                    <FileText className="h-4 w-4 text-blue-500" />
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">筛选总数</p>
                                    <p className="text-lg font-semibold">{batchDetail.totalResumes}</p>
                                  </div>
                                </div>
                              </div>
                              <div className="bg-background rounded-lg p-3 border">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 bg-success/10 rounded">
                                    <TrendingUp className="h-4 w-4 text-success" />
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">筛选通过</p>
                                    <p className="text-lg font-semibold">{batchDetail.screenedCount - batchDetail.screenErrorCount}</p>
                                  </div>
                                </div>
                              </div>
                              <div className="bg-background rounded-lg p-3 border">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 bg-warning/10 rounded">
                                    <AlertCircle className="h-4 w-4 text-warning" />
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">筛选异常</p>
                                    <p className="text-lg font-semibold">{batchDetail.screenErrorCount}</p>
                                  </div>
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        {/* 解析失败的简历列表（如果有） - 仅获取批次显示 */}
                        {batch.source !== 'rescreen' && batchDetail.errorCount > 0 && (
                          <div className="mt-4">
                            <div className="flex items-center gap-2 mb-2">
                              <AlertCircle className="h-4 w-4 text-destructive" />
                              <span className="text-sm font-medium">解析失败的简历</span>
                              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                                {batchDetail.errorCount} 份
                              </Badge>
                            </div>
                            <div className="space-y-2">
                              {batchDetail.resumes
                                .filter((r) => r.status === 'ERROR')
                                .slice(0, 5)
                                .map((resume) => (
                                  <div
                                    key={resume.id}
                                    className="flex items-center justify-between p-2 bg-background rounded border text-sm"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      <span className="truncate">{resume.fileName}</span>
                                      {resume.candidateName && (
                                        <span className="text-muted-foreground">({resume.candidateName})</span>
                                      )}
                                    </div>
                                    {resume.errorMessage && (
                                      <span className="text-xs text-destructive truncate ml-2">
                                        {resume.errorMessage}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              {batchDetail.errorCount > 5 && (
                                <p className="text-xs text-muted-foreground text-center">
                                  还有 {batchDetail.errorCount - 5} 份简历...
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* 创建时间 */}
                        <div className="mt-4 pt-3 border-t text-xs text-muted-foreground">
                          创建于 {formatDateTimeFull(batchDetail.createdAt)}
                          {batchDetail.completedAt && ` | 完成于 ${formatDateTimeFull(batchDetail.completedAt)}`}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
