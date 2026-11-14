'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Pagination } from '@/components/ui/pagination'
import { toast } from 'sonner'
import { saveResumeNavSnapshot } from '@/lib/resume-nav'
import { ResumePageShell } from '@/components/resume/PageShell'
import { ReevaluateFollowUpDialogs } from '@/components/resume/ReevaluateFollowUpDialogs'
import { ReevaluateFilterCard } from '@/components/resume/ReevaluateFilterCard'
import { ReevaluateStatsCards } from '@/components/resume/ReevaluateStatsCards'
import { ReevaluateBatchActions } from '@/components/resume/ReevaluateBatchActions'
import { ReevaluateCandidateTable, ReevaluateTableSkeleton } from '@/components/resume/ReevaluateCandidateTable'
import { ReevaluateEmptyResult, ReevaluateEmptyInitial } from '@/components/resume/ReevaluateEmptyStates'
import { storageSet, storageGet, storageRemove } from '@/lib/utils/local-storage'
import { saveScrollPosition, restoreScrollPosition } from '@/lib/utils/scroll'
import type {
  ReevaluateCandidate,
  ReevaluateConditions,
  ReevaluateFilterValues,
  ReevaluatePosition,
  SavedReevaluateBatch,
  SavedReevaluateFilters,
} from '@/types/reevaluate'
import { BATCH_KEY, EMPTY_FILTERS, FILTERS_KEY, POSITIONS_KEY, SCROLL_KEY } from '@/lib/constants/reevaluate'

// ─────────────────────────────────────────────────────────
// 主页面
// ─────────────────────────────────────────────────────────
export default function ReevaluatePage() {
  // ── 岗位 ──
  const [positions, setPositions] = useState<ReevaluatePosition[]>([])
  const [positionsLoading, setPositionsLoading] = useState(true)

  // ── 筛选条件 ──
  const [selectedPositionId, setSelectedPositionId] = useState('')
  const [appliedPositionIds, setAppliedPositionIds] = useState<string[]>([])
  const [hasModel, setHasModel] = useState(false)
  const [filters, setFilters] = useState<ReevaluateFilterValues>({ ...EMPTY_FILTERS })
  const [showFilters, setShowFilters] = useState(true)

  // ── 候选人 ──
  const [candidates, setCandidates] = useState<ReevaluateCandidate[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)

  // ── 评估 ──
  const [evaluating, setEvaluating] = useState(false)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  // ── 自动刷新标记（返回页面时触发） ──
  const [shouldAutoRefresh, setShouldAutoRefresh] = useState(false)

  // ── 分页 ──
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(30)

  // 写入详情页连续浏览导航快照（跳转详情前调用；本页一次拉全量候选人，快照含全部 id，无需分页追加）
  const writeNavSnapshot = useCallback(() => {
    if (candidates.length === 0) return
    saveResumeNavSnapshot({
      ids: candidates.map((c) => c.id),
      page: 0,
      pageSize: 0,
      totalPages: 0,
    })
  }, [candidates])

  // ── 跟进 ──
  const [followUpCandidate, setFollowUpCandidate] = useState<ReevaluateCandidate | null>(null)
  const [batchFollowUpOpen, setBatchFollowUpOpen] = useState(false)

  // ── 恢复标记 ──
  const restored = useRef(false)
  // ── 轮询 interval 引用（组件卸载时清理） ──
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // ── refreshCandidates 引用（恢复逻辑中需要调用） ──
  const refreshCandidatesRef = useRef<() => Promise<void>>(async () => {})

  // ── 清理旧版 sessionStorage 键名 ──
  useEffect(() => {
    try {
      sessionStorage.removeItem('reevaluate-filters')
      sessionStorage.removeItem('reevaluate-from-detail')
      sessionStorage.removeItem('reevaluate-scroll-y')
    } catch { /* ignore */ }
  }, [])

  // ══════════════════════════════════════════════════════
  // 加载岗位列表（优先从缓存恢复，后台刷新）
  // ══════════════════════════════════════════════════════
  useEffect(() => {
    // 先从 localStorage 恢复岗位列表，避免等待 API
    const cached = storageGet<ReevaluatePosition[]>(POSITIONS_KEY)
    if (cached && cached.length > 0) {
      setPositions(cached)
      setPositionsLoading(false)
    } else {
      setPositionsLoading(true)
    }

    fetch('/api/positions')
      .then((r) => r.json())
      .then((data) => {
        const list = data.positions || []
        setPositions(list)
        storageSet(POSITIONS_KEY, list)
      })
      .catch(() => {
        if (!cached || cached.length === 0) {
          toast.error('加载岗位列表失败')
        }
      })
      .finally(() => setPositionsLoading(false))
  }, [])

  // ══════════════════════════════════════════════════════
  // 岗位就绪后 → 恢复持久化的状态（岗位优先从缓存加载，几乎即时）
  // ══════════════════════════════════════════════════════
  useEffect(() => {
    if (positions.length === 0 || restored.current) return
    restored.current = true

    // 1) 恢复筛选条件
    const savedFilters = storageGet<SavedReevaluateFilters>(FILTERS_KEY)
    if (savedFilters?.selectedPositionId && positions.some((p) => p.id === savedFilters.selectedPositionId)) {
      setSelectedPositionId(savedFilters.selectedPositionId)
      if (savedFilters.appliedPositionIds?.length) {
        setAppliedPositionIds(
          savedFilters.appliedPositionIds.filter((id) => positions.some((p) => p.id === id))
        )
      }
      setFilters({
        minEducation: savedFilters.minEducation || '',
        schoolTier: savedFilters.schoolTier || '',
        majors: savedFilters.majors || '',
        minWorkYears: savedFilters.minWorkYears || '',
        minGraduationYears: savedFilters.minGraduationYears || '',
        maxGraduationYears: savedFilters.maxGraduationYears || '',
        englishLevel: savedFilters.englishLevel || '',
      })
      if (typeof savedFilters.showFilters === 'boolean') setShowFilters(savedFilters.showFilters)

      // 2) 若有候选人记录 → 标记自动刷新（等状态提交后触发）
      if (savedFilters.hasCandidates) {
        setShouldAutoRefresh(true)
      }

      // 3) 恢复评估批次状态（跨页面导航恢复轮询）
      const savedBatch = storageGet<SavedReevaluateBatch>(BATCH_KEY)
      if (
        savedBatch &&
        savedBatch.batchId &&
        savedBatch.evaluating &&
        savedBatch.positionId === savedFilters.selectedPositionId
      ) {
        // 先查询批次当前状态
        fetch(`/api/task-batches/${savedBatch.batchId}`)
          .then((r) => r.json())
          .then((pd) => {
            const batch = pd.batch
            if (!batch) {
              storageRemove(BATCH_KEY)
              return
            }
            if (batch.status === 'completed') {
              // 批次已完成 → 显示完成状态并刷新候选人
              setBatchId(savedBatch.batchId)
              setProgress(100)
              setEvaluating(false)
              storageSet<SavedReevaluateBatch>(BATCH_KEY, {
                batchId: savedBatch.batchId,
                positionId: savedBatch.positionId,
                evaluating: false,
              })
              // 刷新候选人列表以获取最新评分
              refreshCandidatesRef.current?.()
            } else {
              // 批次仍在进行 → 恢复轮询
              setBatchId(savedBatch.batchId)
              setEvaluating(true)
              setProgress(batch.progress?.screening ?? 0)
              // 启动轮询
              if (pollingRef.current) clearInterval(pollingRef.current)
              pollingRef.current = setInterval(async () => {
                try {
                  const r = await fetch(`/api/task-batches/${savedBatch.batchId}`)
                  const d = await r.json()
                  const latest = d.batch
                  if (latest?.status === 'completed') {
                    if (pollingRef.current) {
                      clearInterval(pollingRef.current)
                      pollingRef.current = null
                    }
                    setProgress(100)
                    toast.success('评估全部完成')
                    setEvaluating(false)
                    storageSet<SavedReevaluateBatch>(BATCH_KEY, {
                      batchId: savedBatch.batchId,
                      positionId: savedBatch.positionId,
                      evaluating: false,
                    })
                    refreshCandidatesRef.current?.()
                  } else if (!latest) {
                    // 批次已被删除，停止轮询
                    if (pollingRef.current) {
                      clearInterval(pollingRef.current)
                      pollingRef.current = null
                    }
                    setEvaluating(false)
                    storageRemove(BATCH_KEY)
                  } else {
                    setProgress(latest?.progress?.screening ?? 0)
                  }
                } catch {
                  // 网络错误不中断轮询
                }
              }, 2000)
            }
          })
          .catch(() => {
            // 查询失败，清理无效状态
            storageRemove(BATCH_KEY)
          })
      }
    }
  }, [positions])

  // ══════════════════════════════════════════════════════
  // 选择岗位时检查是否有默认模型
  // ══════════════════════════════════════════════════════
  useEffect(() => {
    if (!selectedPositionId) {
      setHasModel(false)
      return
    }
    fetch(`/api/positions/${selectedPositionId}/has-initial-model`)
      .then((r) => r.json())
      .then((data) => setHasModel(data.hasModel))
      .catch(() => setHasModel(false))
  }, [selectedPositionId])

  // ══════════════════════════════════════════════════════
  // 投递岗位多选选项：跟随目标岗位部门过滤（目标岗位无部门时为全部启用岗位）
  // ══════════════════════════════════════════════════════
  const appliedPositionOptions = useMemo(() => {
    if (!selectedPositionId) return []
    const targetDept = positions.find((p) => p.id === selectedPositionId)?.department
    const list = targetDept ? positions.filter((p) => p.department === targetDept) : positions
    return list.map((p) => ({ value: p.id, label: p.title }))
  }, [positions, selectedPositionId])

  // ══════════════════════════════════════════════════════
  // 切换目标岗位时清空投递岗位多选（部门口径变化）
  // ══════════════════════════════════════════════════════
  const prevPositionIdRef = useRef('')
  useEffect(() => {
    if (prevPositionIdRef.current && prevPositionIdRef.current !== selectedPositionId) {
      setAppliedPositionIds([])
    }
    prevPositionIdRef.current = selectedPositionId
  }, [selectedPositionId])

  // ══════════════════════════════════════════════════════
  // 筛选条件变更 → 持久化到 localStorage
  // ══════════════════════════════════════════════════════
  useEffect(() => {
    if (!selectedPositionId) return
    const prev = storageGet<SavedReevaluateFilters>(FILTERS_KEY)
    storageSet<SavedReevaluateFilters>(FILTERS_KEY, {
      selectedPositionId,
      appliedPositionIds,
      ...filters,
      showFilters,
      hasCandidates: prev?.hasCandidates ?? (candidates.length > 0),
    })
  }, [selectedPositionId, appliedPositionIds, filters, showFilters, candidates.length])

  // ══════════════════════════════════════════════════════
  // 候选人列表变更 → 更新 hasCandidates 标记
  // ══════════════════════════════════════════════════════
  useEffect(() => {
    if (!selectedPositionId) return
    const saved = storageGet<SavedReevaluateFilters>(FILTERS_KEY)
    if (saved) {
      storageSet<SavedReevaluateFilters>(FILTERS_KEY, { ...saved, hasCandidates: candidates.length > 0 })
    }
  }, [candidates.length, selectedPositionId])

  // ══════════════════════════════════════════════════════
  // 批次状态变更 → 自动持久化
  // ══════════════════════════════════════════════════════
  useEffect(() => {
    if (batchId && selectedPositionId) {
      storageSet<SavedReevaluateBatch>(BATCH_KEY, {
        batchId,
        positionId: selectedPositionId,
        evaluating,
      })
    }
  }, [evaluating, batchId, selectedPositionId])

  // ══════════════════════════════════════════════════════
  // 组件卸载时清理轮询 interval
  // ══════════════════════════════════════════════════════
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [])

  // ══════════════════════════════════════════════════════
  // 页面卸载 / 隐藏时保存滚动位置
  // ══════════════════════════════════════════════════════
  useEffect(() => {
    // beforeunload 覆盖 F5 / 关闭标签
    const onBefore = () => saveScrollPosition(SCROLL_KEY)
    // visibilitychange 覆盖导航跳转（SPA 路由切换时不会触发 beforeunload）
    const onVisible = () => {
      if (document.visibilityState === 'hidden') saveScrollPosition(SCROLL_KEY)
    }
    window.addEventListener('beforeunload', onBefore)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('beforeunload', onBefore)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // ══════════════════════════════════════════════════════
  // 右键点击候选人名称前往详情页时，再次确保所有状态已保存
  // ══════════════════════════════════════════════════════
  const saveBatchState = useCallback(() => {
    if (!batchId || !selectedPositionId) return
    storageSet<SavedReevaluateBatch>(BATCH_KEY, {
      batchId,
      positionId: selectedPositionId,
      evaluating,
    })
  }, [batchId, selectedPositionId, evaluating])

  const ensureStateSaved = useCallback(() => {
    if (!selectedPositionId) return
    storageSet<SavedReevaluateFilters>(FILTERS_KEY, {
      selectedPositionId,
      appliedPositionIds,
      ...filters,
      showFilters,
      hasCandidates: candidates.length > 0,
    })
    saveBatchState()
    saveScrollPosition(SCROLL_KEY)
  }, [selectedPositionId, appliedPositionIds, filters, showFilters, candidates.length, saveBatchState])

  // ══════════════════════════════════════════════════════
  // 清除筛选
  // ══════════════════════════════════════════════════════
  const resetFilters = () => {
    setAppliedPositionIds([])
    setFilters({ ...EMPTY_FILTERS })
    // 不重置岗位选择，只清除选项条件
    storageRemove(FILTERS_KEY)
  }

  /** 筛选值局部更新（FilterCard 用） */
  const handleFilterChange = useCallback((key: keyof ReevaluateFilterValues, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }, [])

  const hasAnyFilter = !!(
    appliedPositionIds.length > 0 || filters.minEducation || filters.schoolTier || filters.majors ||
    filters.minWorkYears || filters.minGraduationYears || filters.maxGraduationYears || filters.englishLevel
  )

  // 构建硬性筛选条件对象
  const buildConditions = useCallback((): ReevaluateConditions => {
    const conditions: ReevaluateConditions = {}
    if (filters.minEducation) conditions.minEducation = filters.minEducation
    if (filters.schoolTier) conditions.schoolTier = filters.schoolTier
    if (filters.majors) conditions.majors = filters.majors
    if (filters.minWorkYears) conditions.minWorkYears = parseInt(filters.minWorkYears, 10)
    if (filters.minGraduationYears) conditions.minGraduationYears = parseInt(filters.minGraduationYears, 10)
    if (filters.maxGraduationYears) conditions.maxGraduationYears = parseInt(filters.maxGraduationYears, 10)
    if (filters.englishLevel) conditions.englishLevel = filters.englishLevel
    return conditions
  }, [filters])

  // ══════════════════════════════════════════════════════
  // 刷新候选人列表
  // ══════════════════════════════════════════════════════
  const refreshCandidates = useCallback(async () => {
    if (!selectedPositionId) {
      toast.error('请先选择目标岗位')
      return
    }
    setLoading(true)
    setCandidates([])
    try {
      const conditions = buildConditions()

      const res = await fetch('/api/resumes/candidate-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId: selectedPositionId, appliedPositionIds, conditions }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
        return
      }
      const list = data.candidates || []
      setCandidates(list)
      setSelectedIds(new Set())
      setFetchedAt(Date.now())
    } catch {
      toast.error('查询候选池失败')
    } finally {
      setLoading(false)
    }
  }, [selectedPositionId, appliedPositionIds, buildConditions])

  // 保持 ref 与最新 refreshCandidates 同步（供恢复逻辑使用）
  useEffect(() => {
    refreshCandidatesRef.current = refreshCandidates
  }, [refreshCandidates])

  // 候选人数据变更时重置分页
  useEffect(() => {
    setPage(1)
  }, [candidates])

  // 自动刷新：等 selectedPositionId 状态提交后再触发 refreshCandidates
  useEffect(() => {
    if (shouldAutoRefresh && selectedPositionId) {
      setShouldAutoRefresh(false)
      refreshCandidatesRef.current?.()
    }
  }, [shouldAutoRefresh, selectedPositionId])

  // ══════════════════════════════════════════════════════
  // 候选人列表加载完成后恢复滚动位置
  // ══════════════════════════════════════════════════════
  useEffect(() => {
    if (!loading && candidates.length > 0) {
      restoreScrollPosition(SCROLL_KEY)
    }
  }, [loading, candidates.length])

  // ══════════════════════════════════════════════════════
  // 发起评估
  // ══════════════════════════════════════════════════════
  const startEvaluation = async () => {
    if (selectedIds.size === 0) {
      toast.error('请至少选择一位候选人')
      return
    }
    if (!hasModel) {
      toast.error('目标岗位未配置默认初筛模型')
      return
    }
    setEvaluating(true)
    try {
      const conditions = buildConditions()

      const res = await fetch('/api/resumes/reevaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positionId: selectedPositionId,
          resumeIds: Array.from(selectedIds),
          conditions,
        }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
        setEvaluating(false)
        return
      }
      setBatchId(data.batchId)
      setProgress(0)
      // 持久化批次状态（跨页面导航恢复）
      storageSet<SavedReevaluateBatch>(BATCH_KEY, {
        batchId: data.batchId,
        positionId: selectedPositionId,
        evaluating: true,
      })
      toast.success(`已发起评估，共 ${data.count} 份`)

      // 清理旧轮询
      if (pollingRef.current) clearInterval(pollingRef.current)

      // 轮询进度
      pollingRef.current = setInterval(async () => {
        try {
          const pr = await fetch(`/api/task-batches/${data.batchId}`)
          const pd = await pr.json()
          const batch = pd.batch
          if (batch?.status === 'completed') {
            if (pollingRef.current) {
              clearInterval(pollingRef.current)
              pollingRef.current = null
            }
            setProgress(100)
            toast.success('评估全部完成')
            setEvaluating(false)
            storageSet<SavedReevaluateBatch>(BATCH_KEY, {
              batchId: data.batchId,
              positionId: selectedPositionId,
              evaluating: false,
            })
            refreshCandidatesRef.current?.()
          } else {
            setProgress(batch?.progress?.screening ?? 0)
          }
        } catch {
          // 网络错误不中断轮询
        }
      }, 2000)
    } catch {
      toast.error('发起评估失败')
      setEvaluating(false)
    }
  }

  // ── 表头 checkbox ref（设置 indeterminate 三态）──
  const headerCheckboxRef = useRef<HTMLInputElement>(null)

  // ── 全局全选/取消（与 list/screened/emails 页面行为一致）──
  const toggleSelectAll = (e?: React.MouseEvent) => {
    // Shift+点击 → 仅操作当前页
    if (e?.shiftKey) {
      const pageIds = paginatedCandidates.map((c) => c.id)
      if (pageIds.every((id) => selectedIds.has(id)) && pageIds.length > 0) {
        setSelectedIds((prev) => {
          const next = new Set(prev)
          pageIds.forEach((id) => next.delete(id))
          return next
        })
      } else {
        setSelectedIds((prev) => new Set([...prev, ...pageIds]))
      }
      return
    }

    // 普通点击 → 全选或取消所有
    if (selectedIds.size === candidates.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(candidates.map((c) => c.id)))
    }
  }

  // ── 同步 indeterminate 状态 ──
  useEffect(() => {
    const el = headerCheckboxRef.current
    if (!el) return
    el.indeterminate = selectedIds.size > 0 && selectedIds.size < candidates.length
  }, [selectedIds.size, candidates.length])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── 批量跟进：筛选已选中且已评估的候选人 ──
  const batchFollowUpCandidates = useMemo(
    () => candidates.filter((c) => selectedIds.has(c.id) && c.evaluated),
    [candidates, selectedIds]
  )

  // ── 单份跟进成功回调 ──
  const onFollowUpSuccess = useCallback((resumeId: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== resumeId))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(resumeId)
      return next
    })
    setFollowUpCandidate(null)
  }, [])

  // ── 批量跟进成功回调 ──
  const onBatchFollowUpSuccess = useCallback(() => {
    const ids = new Set(batchFollowUpCandidates.map((c) => c.id))
    setCandidates((prev) => prev.filter((c) => !ids.has(c.id)))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })
    setBatchFollowUpOpen(false)
  }, [batchFollowUpCandidates])

  // ── 计算属性 ──
  const totalPages = Math.max(1, Math.ceil(candidates.length / pageSize))
  const paginatedCandidates = useMemo(
    () => candidates.slice((page - 1) * pageSize, page * pageSize),
    [candidates, page, pageSize]
  )

  const evaluatedCount = useMemo(
    () => candidates.filter((c) => c.evaluated).length,
    [candidates]
  )

  const avgScore = useMemo(() => {
    const scored = candidates.filter((c) => c.initialScore != null)
    return scored.length > 0
      ? Math.round(
          scored.reduce((sum, c) => sum + c.initialScore!, 0) / scored.length
        )
      : null
  }, [candidates])

  return (
    <ResumePageShell className="space-y-6 max-w-[1600px] mx-auto">
      {/* ========== 页面标题 ========== */}
      <div className="relative">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">简历复用评估</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              选择目标岗位与筛选条件，对候选池中的简历进行 AI 重新评估
            </p>
          </div>
        </div>
      </div>

      {/* ========== 筛选区域 ========== */}
      <ReevaluateFilterCard
        positions={positions}
        positionsLoading={positionsLoading}
        selectedPositionId={selectedPositionId}
        onSelectPosition={setSelectedPositionId}
        appliedPositionIds={appliedPositionIds}
        onAppliedPositionIdsChange={setAppliedPositionIds}
        appliedPositionOptions={appliedPositionOptions}
        hasModel={hasModel}
        filters={filters}
        onFilterChange={handleFilterChange}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(!showFilters)}
        hasAnyFilter={hasAnyFilter}
        onResetFilters={resetFilters}
        loading={loading}
        onRefresh={refreshCandidates}
      />

      {/* ========== 统计概要 ========== */}
      {candidates.length > 0 && !loading && (
        <ReevaluateStatsCards
          candidateCount={candidates.length}
          evaluatedCount={evaluatedCount}
          avgScore={avgScore}
        />
      )}

      {/* ========== 候选人列表 ========== */}
      {candidates.length > 0 && !loading && (
        <Card className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          <ReevaluateBatchActions
            candidateCount={candidates.length}
            selectedCount={selectedIds.size}
            batchFollowUpCount={batchFollowUpCandidates.length}
            hasModel={hasModel}
            selectedPositionId={selectedPositionId}
            evaluating={evaluating}
            progress={progress}
            fetchedAt={fetchedAt}
            onStartEvaluation={startEvaluation}
            onOpenBatchFollowUp={() => setBatchFollowUpOpen(true)}
          />
          <CardContent className="p-0">
            <ReevaluateCandidateTable
              candidates={candidates}
              paginatedCandidates={paginatedCandidates}
              selectedIds={selectedIds}
              headerCheckboxRef={headerCheckboxRef}
              onToggleSelectAll={toggleSelectAll}
              onToggleSelect={toggleSelect}
              selectedPositionId={selectedPositionId}
              onFollowUp={setFollowUpCandidate}
              onEnsureStateSaved={ensureStateSaved}
              onWriteNavSnapshot={writeNavSnapshot}
            />
          </CardContent>
          {totalPages > 1 && (
            <div className="px-6 py-3 border-t">
              <Pagination
                page={page}
                totalPages={totalPages}
                total={candidates.length}
                pageSize={pageSize}
                unitLabel="份"
                pageSizeOptions={[
                  { value: 30, label: '30条/页' },
                  { value: 50, label: '50条/页' },
                  { value: 100, label: '100条/页' },
                ]}
                onPageChange={(p) => { setPage(p) }}
                onPageSizeChange={(ps) => { setPageSize(ps); setPage(1) }}
              />
            </div>
          )}
        </Card>
      )}

      {/* ========== 加载骨架屏 ========== */}
      {loading && (
        <Card className="animate-in fade-in duration-200">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="h-5 w-28 bg-muted rounded animate-pulse" />
              <div className="h-5 w-14 bg-muted rounded animate-pulse" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ReevaluateTableSkeleton />
          </CardContent>
        </Card>
      )}

      {/* ========== 空状态（已查询但无结果） ========== */}
      {!loading && candidates.length === 0 && selectedPositionId && (
        <ReevaluateEmptyResult onResetFilters={resetFilters} />
      )}

      {/* ========== 初始空状态（未查询） ========== */}
      {!loading && candidates.length === 0 && !selectedPositionId && (
        <ReevaluateEmptyInitial />
      )}

      {/* ========== 跟进弹窗 ========== */}
      <ReevaluateFollowUpDialogs
        candidate={followUpCandidate}
        onCloseCandidate={() => setFollowUpCandidate(null)}
        onCandidateSuccess={onFollowUpSuccess}
        batchOpen={batchFollowUpOpen}
        onCloseBatch={() => setBatchFollowUpOpen(false)}
        batchCandidates={batchFollowUpCandidates}
        selectedPositionId={selectedPositionId}
        selectedPositionTitle={positions.find((p) => p.id === selectedPositionId)?.title || ''}
        onBatchSuccess={onBatchFollowUpSuccess}
      />
    </ResumePageShell>
  )
}
