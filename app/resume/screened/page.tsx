'use client'

import { useEffect, useState, useCallback, Suspense, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import type { SortCondition } from '@/components/ui/multi-sort-selector'
import { FileText, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useScrollPosition } from '@/lib/hooks/use-scroll-position'
import { ResumePageShell } from '@/components/resume/PageShell'
import { FollowUpDialog } from '@/components/resume/FollowUpDialog'
import { BatchFollowUpDialog } from '@/components/resume/BatchFollowUpDialog'
import { UnsuitableDialog } from '@/components/resume/UnsuitableDialog'
import { saveResumeNavSnapshot } from '@/lib/resume-nav'
import { ScreenedBatchActions } from '@/components/resume/ScreenedBatchActions'
import { ScreenedFilterBar } from '@/components/resume/ScreenedFilterBar'
import { ScreenedResumeCard } from '@/components/resume/ScreenedResumeCard'
// 类型定义已移至 types/resume.ts（ScreenedResumeItem / ResumeListPagination / PositionOption / FilterOption）
import type { ScreenedResumeItem, ResumeListPagination, PositionOption, FilterOption } from '@/types/resume'
import { apiErrorMessage } from '@/lib/utils/api-message'

// 状态颜色单点（B8）：从 lib/constants/resume-status 导入

function parseSortConditions(sortsParam: string | null): SortCondition[] {
  if (!sortsParam) return []
  
  return sortsParam.split(',').map(sortStr => {
    const [key, order] = sortStr.split(':')
    return {
      key: key.trim(),
      order: (order?.trim() === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc'
    }
  }).filter(condition => condition.key)
}

function formatSortConditions(conditions: SortCondition[]): string {
  return conditions.map(c => `${c.key}:${c.order}`).join(',')
}


function ScreenedPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ==================== URL 中已应用的值（用于 API 调用和返回恢复） ====================
  const appliedSearch = searchParams.get('search') || ''
  const appliedPositionIds = useMemo(
    () => (searchParams.get('positionId') || '').split(',').filter(Boolean),
    [searchParams]
  )
  const appliedResumeSourceId = searchParams.get('resumeSourceId') || ''
  const page = Number(searchParams.get('page')) || 1
  const pageSize = Number(searchParams.get('pageSize')) || 20
  const appliedSorts = searchParams.get('sorts') || ''

  // 当前完整查询字符串，用于详情页返回时恢复筛选/排序状态
  const currentQueryString = searchParams.toString()

  // ==================== 本地草稿状态（筛选器编辑中，尚未提交） ====================
  const [searchInput, setSearchInput] = useState(appliedSearch)
  const [draftPositionIds, setDraftPositionIds] = useState<string[]>(appliedPositionIds)
  const [draftResumeSourceId, setDraftResumeSourceId] = useState(appliedResumeSourceId)

  // 排序条件 — 点"完成"即时提交，无草稿
  const [sortConditions, setSortConditions] = useState<SortCondition[]>(() => {
    const conditions = parseSortConditions(appliedSorts || null)
    if (conditions.length === 0) {
      const sortBy = searchParams.get('sortBy')
      const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc'
      if (sortBy) {
        return [{ key: sortBy, order: sortOrder }]
      }
    }
    return conditions.length > 0 ? conditions : [{ key: 'receivedAt', order: 'desc' }]
  })

  // 记录是否需要在 URL 更新后触发一次加载（避免恢复时先发一次无条件请求）
  const pendingSessionRestoreRef = useRef(false)

  // 挂载时：如果 URL 无参数，从 sessionStorage 恢复筛选条件
  const [filterInitialized, setFilterInitialized] = useState(false)
  useEffect(() => {
    if (filterInitialized) return
    setFilterInitialized(true)
    // URL 有参数说明是有意图的导航（详情返回、搜索等），不需要恢复
    if (searchParams.toString()) return
    try {
      const saved = sessionStorage.getItem('screened-filters')
      if (saved) {
        const savedParams = new URLSearchParams(saved)
        // 同步草稿状态，否则 UI 不显示恢复后的筛选值
        setSearchInput(savedParams.get('search') || '')
        setDraftPositionIds((savedParams.get('positionId') || '').split(',').filter(Boolean))
        setDraftResumeSourceId(savedParams.get('resumeSourceId') || '')
        const savedSorts = savedParams.get('sorts') || ''
        if (savedSorts) {
          const conditions = parseSortConditions(savedSorts)
          if (conditions.length > 0) setSortConditions(conditions)
        }
        pendingSessionRestoreRef.current = true
        router.replace(`/resume/screened?${saved}`, { scroll: false })
      }
    } catch { /* sessionStorage 不可用时忽略 */ }
  }, [filterInitialized, searchParams, router])

  const updateParams = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    }
    const queryStr = params.toString()
    // 保存到 sessionStorage，侧边栏切回来时恢复
    try { sessionStorage.setItem('screened-filters', queryStr) } catch { /* 忽略 */ }
    router.replace(`/resume/screened?${queryStr}`, { scroll: false })
  }, [router, searchParams])

  const handleSortChange = useCallback((conditions: SortCondition[]) => {
    const sortsStr = conditions.length > 0 ? formatSortConditions(conditions) : ''
    setSortConditions(conditions)
    updateParams({
      sorts: sortsStr,
      sortBy: '',
      sortOrder: '',
      page: ''
    })
  }, [updateParams])

  // ==================== 搜索按钮 ====================
  const handleSearch = useCallback(() => {
    updateParams({
      search: searchInput,
      positionId: draftPositionIds.join(','),
      resumeSourceId: draftResumeSourceId,
      page: '',
    })
  }, [searchInput, draftPositionIds, draftResumeSourceId, updateParams])

  // ==================== 重置按钮 ====================
  const handleReset = useCallback(() => {
    setSearchInput('')
    setDraftPositionIds([])
    setDraftResumeSourceId('')
    try { sessionStorage.removeItem('screened-filters') } catch { /* 忽略 */ }
    router.replace('/resume/screened', { scroll: false })
  }, [router])

  // ==================== 分页 ====================
  const setPage = useCallback((v: number) => {
    // 回到上一页时清除目标页的滚动位置缓存，确保页面滚到顶部
    if (v < page) {
      const targetParams = new URLSearchParams(searchParams.toString())
      if (v > 1) {
        targetParams.set('page', String(v))
      } else {
        targetParams.delete('page')
      }
      try { sessionStorage.removeItem(`/resume/screened?${targetParams.toString()}`) } catch { /* ignore */ }
    }
    updateParams({ page: v > 1 ? String(v) : '' })
  }, [updateParams, page, searchParams])
  const setPageSize = useCallback((size: number) => updateParams({ pageSize: String(size), page: '' }), [updateParams])

  const [resumes, setResumes] = useState<ScreenedResumeItem[]>([])
  const [pagination, setPagination] = useState<ResumeListPagination>({ page: 1, pageSize: 20, total: 0, totalPages: 0 })
  const [positions, setPositions] = useState<PositionOption[]>([])
  const [resumeSources, setResumeSources] = useState<FilterOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [followUpResumeId, setFollowUpResumeId] = useState<string | null>(null)
  const [followUpResumeName, setFollowUpResumeName] = useState('')
  const [followUpAiTagNames, setFollowUpAiTagNames] = useState<string[]>([])
  const [followUpPositionScores, setFollowUpPositionScores] = useState<ScreenedResumeItem['positionScores']>([])
  const [followUpDefaultEvalId, setFollowUpDefaultEvalId] = useState<string | undefined>(undefined)

  const [batchFollowUpOpen, setBatchFollowUpOpen] = useState(false)

  // 滚动位置记忆
  const { save: saveScrollPos, restore: restoreScrollPos } = useScrollPosition({
    storageKey: `/resume/screened?${currentQueryString}`,
    page,
    onBackToPrevPage: () => setPage(page - 1),
  })

  const pendingRestoreRef = useRef<number | null>(null)

  // loadResumes 完成后恢复滚动位置（loading 从 true → false 时触发）
  useEffect(() => {
    if (!loading && pendingRestoreRef.current !== null) {
      restoreScrollPos(pendingRestoreRef.current)
      pendingRestoreRef.current = null
    }
  }, [loading, restoreScrollPos])

  // 不合适弹窗状态
  const [unsuitableResumeId, setUnsuitableResumeId] = useState<string | null>(null)
  const [unsuitableResumeName, setUnsuitableResumeName] = useState('')
  const [unsuitableEvaluationId, setUnsuitableEvaluationId] = useState<string | undefined>(undefined)
  const [unsuitableAiTagNames, setUnsuitableAiTagNames] = useState<string[]>([])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === resumes.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(resumes.map((r) => r.id)))
    }
  }, [selectedIds.size, resumes])

  // 处理星级评分修改
  const handleRatingChange = useCallback(async (resumeId: string, dimension: string, rating: number) => {
    try {
      // 获取该简历的 positionId（优先使用 URL 筛选的岗位）
      const resume = resumes.find(r => r.id === resumeId)
      const urlPositionId = searchParams.get('positionId')
      const positionId = (urlPositionId && !urlPositionId.includes(',') && urlPositionId !== 'UNASSIGNED')
        ? urlPositionId
        : resume?.position?.id || null

      const res = await fetch('/api/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeId,
          positionId,
          dimensions: [{ dimension, rating }],
          source: 'manual',
        }),
      })
      const json = await res.json()
      if (json.success) {
        // 更新该行的初筛得分和评估维度
        setResumes((prev) =>
          prev.map((r) => {
            if (r.id !== resumeId) return r
            const newEvals = r.evaluationDimensions.map((e) =>
              e.dimension === dimension ? { ...e, rating, positionId: positionId ?? undefined } : e
            )
            // 如果该维度不存在，添加
            if (!newEvals.find((e) => e.dimension === dimension)) {
              newEvals.push({ dimension, rating, comment: null, source: 'manual', positionId: positionId ?? undefined })
            }
            return {
              ...r,
              initialScore: json.scores.initialScore,
              evaluationDimensions: newEvals,
            }
          })
        )
        toast.success('评分已更新')
      } else {
        toast.error(json.error || '保存失败')
      }
    } catch {
      toast.error('保存失败')
    }
  }, [resumes, searchParams])

  // 构建列表 API 查询参数（筛选 + 排序，不含分页），供列表加载与详情页导航快照共用
  const buildApiParams = useCallback(() => {
    const params = new URLSearchParams()
    params.set('status', 'SCREENED')
    if (appliedSearch) params.set('search', appliedSearch)
    if (appliedPositionIds.length > 0) params.set('positionId', appliedPositionIds.join(','))
    if (appliedResumeSourceId) params.set('resumeSourceId', appliedResumeSourceId)
    params.set('followUp', 'NO')
    // 已筛选界面岗位筛选只认主岗位，不匹配复用评估岗位
    params.set('positionMatch', 'main')

    // 使用多级排序参数
    const sortsStr = formatSortConditions(sortConditions)
    if (sortsStr) params.set('sorts', sortsStr)
    return params
  }, [appliedSearch, appliedPositionIds, appliedResumeSourceId, sortConditions])

  const loadResumes = useCallback(async () => {
    setLoading(true)
    try {
      const params = buildApiParams()
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))

      const res = await fetch(`/api/resumes?${params}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setResumes(json.resumes)
      setPagination(json.pagination)
      setSelectedIds(new Set())
      pendingRestoreRef.current = json.resumes.length
    } catch (err: unknown) {
      const msg = apiErrorMessage(err, '加载失败，请稍后重试')
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [buildApiParams, page, pageSize])

  // 写入详情页连续浏览导航快照（跳转详情前调用）
  const writeNavSnapshot = useCallback(() => {
    if (resumes.length === 0) return
    saveResumeNavSnapshot({
      ids: resumes.map((r) => r.id),
      page,
      pageSize,
      totalPages: pagination.totalPages,
      apiUrl: '/api/resumes?' + buildApiParams().toString(),
      idSource: 'resumes',
    })
  }, [resumes, page, pageSize, pagination.totalPages, buildApiParams])

  const loadFilters = useCallback(async () => {
    try {
      const [posRes, srcRes] = await Promise.all([
        fetch('/api/positions'),
        fetch('/api/config/resume-sources'),
      ])
      const posJson = await posRes.json()
      const srcJson = await srcRes.json()
      setPositions(posJson.positions || [])
      setResumeSources((srcJson.sources || []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => { loadFilters() }, [loadFilters])
  useEffect(() => {
    // 如果正在从 sessionStorage 恢复 URL 参数，等 URL 更新后再加载
    if (pendingSessionRestoreRef.current) {
      pendingSessionRestoreRef.current = false
      return
    }
    loadResumes()
  }, [loadResumes])

  // 页面隐藏时保存滚动位置，重新可见时重新加载
  // 注意：visibilitychange 只在 tab 级切换时触发，SPA 导航不触发
  // 组件卸载时的保存由下方的 cleanup effect 负责
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadResumes()
      } else {
        saveScrollPos()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [loadResumes, saveScrollPos])

  // 点击任意元素时保存滚动位置（click 事件在 SPA Link 导航之前同步执行，保证 DOM 完整）
  useEffect(() => {
    const handleClick = () => { saveScrollPos() }
    document.addEventListener('click', handleClick, { capture: true })
    return () => document.removeEventListener('click', handleClick, { capture: true })
  }, [saveScrollPos])

  const handleFollowUp = (resume: ScreenedResumeItem) => {
    saveScrollPos()
    setFollowUpResumeId(resume.id)
    setFollowUpResumeName(resume.candidateName || '未知')
    setFollowUpPositionScores(resume.positionScores || [])
    // 根据当前 URL 筛选的岗位确定默认 evaluationId
    const urlPositionId = searchParams.get('positionId')
    const isSinglePos = urlPositionId && !urlPositionId.includes(',') && urlPositionId !== 'UNASSIGNED'
    const defaultScore = (resume.positionScores || []).find(
      s => s.positionId === (isSinglePos ? urlPositionId : resume.position?.id)
    )
    setFollowUpDefaultEvalId(defaultScore?.evaluationId || undefined)
    // 解析 AI 标签
    try {
      const tags = resume.screeningResult?.aiTags
      setFollowUpAiTagNames(tags ? (JSON.parse(tags) as string[]) : [])
    } catch { setFollowUpAiTagNames([]) }
  }

  const handleUnsuitable = (resume: ScreenedResumeItem) => {
    saveScrollPos()
    setUnsuitableResumeId(resume.id)
    setUnsuitableResumeName(resume.candidateName || '未知')
    const urlPositionId = searchParams.get('positionId')
    const isSinglePos = urlPositionId && !urlPositionId.includes(',') && urlPositionId !== 'UNASSIGNED'
    const defaultScore = (resume.positionScores || []).find(
      s => s.positionId === (isSinglePos ? urlPositionId : resume.position?.id)
    )
    setUnsuitableEvaluationId(defaultScore?.evaluationId || undefined)
    // 解析 AI 标签
    try {
      const tags = resume.screeningResult?.aiTags
      setUnsuitableAiTagNames(tags ? (JSON.parse(tags) as string[]) : [])
    } catch { setUnsuitableAiTagNames([]) }
  }

  return (
    <ResumePageShell>
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <h2 className="text-2xl font-bold">已筛选简历</h2>
          <Button
            onClick={loadResumes}
            disabled={loading}
            variant="ghost"
            size="icon"
            title="刷新列表"
            className="hover:bg-primary hover:text-primary-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Inline selection actions — slides in from right when items selected */}
        <ScreenedBatchActions
          selectedCount={selectedIds.size}
          onBatchFollowUp={() => {
            saveScrollPos()
            setBatchFollowUpOpen(true)
          }}
          onClearSelection={() => setSelectedIds(new Set())}
        />
      </div>

      {/* Filters */}
      <ScreenedFilterBar
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onSearch={handleSearch}
        draftPositionIds={draftPositionIds}
        onDraftPositionIdsChange={setDraftPositionIds}
        positions={positions}
        draftResumeSourceId={draftResumeSourceId}
        onDraftResumeSourceIdChange={setDraftResumeSourceId}
        resumeSources={resumeSources}
        onReset={handleReset}
        loading={loading}
        sortConditions={sortConditions}
        onSortChange={handleSortChange}
      />

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
      ) : resumes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="暂无已筛选简历"
          description="简历完成 AI 筛选后，会连同得分与维度评价显示在这里。"
        />
      ) : (
        <>
          {/* 已筛选卡片流 */}
          <div className="flex items-center justify-between px-1 pb-2">
            <p className="text-xs text-muted-foreground">
              共 {pagination.total} 位候选人
              {selectedIds.size > 0 && <span className="ml-2 text-primary font-medium">已选 {selectedIds.size} 位</span>}
            </p>
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selectedIds.size === resumes.length && resumes.length > 0}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-muted-foreground/30 accent-primary"
              />
              <span className="text-xs text-muted-foreground">全选当前页</span>
            </label>
          </div>

          <div className="space-y-2">
            {resumes.map((resume) => (
              <ScreenedResumeCard
                key={resume.id}
                resume={resume}
                selected={selectedIds.has(resume.id)}
                currentQueryString={currentQueryString}
                onToggleSelect={toggleSelect}
                writeNavSnapshot={writeNavSnapshot}
                onRatingChange={handleRatingChange}
                onFollowUp={handleFollowUp}
                onUnsuitable={handleUnsuitable}
              />
            ))}
          </div>

          {/* Pagination */}
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      )}

      {/* Follow Up Dialog */}
      <FollowUpDialog
        open={!!followUpResumeId}
        onClose={() => setFollowUpResumeId(null)}
        resumeId={followUpResumeId || ''}
        resumeName={followUpResumeName}
        aiTagNames={followUpAiTagNames}
        positionScores={followUpPositionScores}
        defaultEvaluationId={followUpDefaultEvalId}
        onSuccess={() => loadResumes()}
      />

      {/* Batch follow up dialog */}
      <BatchFollowUpDialog
        open={batchFollowUpOpen}
        onClose={() => setBatchFollowUpOpen(false)}
        resumeIds={Array.from(selectedIds)}
        evaluationIds={Array.from(selectedIds).map((id) => {
          const resume = resumes.find((r) => r.id === id)
          if (!resume?.positionScores) return ''
          const urlPositionId = searchParams.get('positionId')
          const isSinglePos = urlPositionId && !urlPositionId.includes(',') && urlPositionId !== 'UNASSIGNED'
          const defaultScore = resume.positionScores.find(
            (s) => s.positionId === (isSinglePos ? urlPositionId : resume.position?.id)
          )
          return defaultScore?.evaluationId || ''
        })}
        candidateNames={resumes
          .filter((r) => selectedIds.has(r.id))
          .map((r) => r.candidateName || '未知')}
        onSuccess={() => loadResumes()}
      />

      {/* Unsuitable Dialog */}
      <UnsuitableDialog
        open={!!unsuitableResumeId}
        onClose={() => setUnsuitableResumeId(null)}
        resumeId={unsuitableResumeId || ''}
        candidateName={unsuitableResumeName}
        evaluationId={unsuitableEvaluationId}
        aiTagNames={unsuitableAiTagNames}
        onSuccess={() => {
          // 立即从本地状态移除该简历（即时反馈，不等待 API 刷新）
          const removedId = unsuitableResumeId
          if (removedId) {
            setResumes(prev => prev.filter(r => r.id !== removedId))
            setPagination(prev => ({ ...prev, total: Math.max(0, prev.total - 1) }))
          }
          // 同时后台刷新确保数据一致性
          loadResumes()
        }}
      />

    </ResumePageShell>
  )
}


export default function ScreenedPage() {
  return (
    <Suspense>
      <ScreenedPageInner />
    </Suspense>
  )
}