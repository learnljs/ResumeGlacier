'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { ResumePageShell } from '@/components/resume/PageShell'
import { Loader2, FileText, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { saveResumeNavSnapshot } from '@/lib/resume-nav'
import { ResumeFilterBar } from '@/components/resume/ResumeFilterBar'
import { ResumeBatchActions } from '@/components/resume/ResumeBatchActions'
import { ResumeListItemCard } from '@/components/resume/ResumeListItemCard'
import { ResumeListToolbar } from '@/components/resume/ResumeListToolbar'
import type { ResumeItem, ResumeListPagination, PositionOption, FilterOption } from '@/types/resume'
import { apiErrorMessage } from '@/lib/utils/api-message'

// 简历列表类型（ResumeItem / ResumeListPagination / PositionOption / FilterOption）已移至 types/resume.ts
// getPrimaryScore / copyName 已移至 components/resume/ResumeListItemCard.tsx

function ResumeListPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // 每个选项卡独立的存储 key
  const TAB_STORAGE_PREFIX = 'resume-list-tab-'
  const ACTIVE_TAB_KEY = 'resume-list-active-tab'

  // 挂载时：如果 URL 无参数，从 sessionStorage 恢复上次活跃的 tab 及其筛选参数
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (initialized) return
    setInitialized(true)
    // 有任何参数说明是有意图的导航，不需要恢复
    if (searchParams.toString()) return
    try {
      const savedTab = sessionStorage.getItem(ACTIVE_TAB_KEY)
      const tab = savedTab && (validTabs as readonly string[]).includes(savedTab) ? savedTab : 'all'
      const savedParams = sessionStorage.getItem(`${TAB_STORAGE_PREFIX}${tab}`) || ''
      const params = new URLSearchParams(savedParams)
      params.set('tab', tab)
      router.replace(`/resume/list?${params.toString()}`, { scroll: false })
    } catch {
      // sessionStorage 不可用时忽略
    }
  }, [initialized, searchParams, router])

  // === 所有筛选状态从 URL searchParams 驱动 ===
  const validTabs = ['all', 'unassigned', 'error'] as const
  type TabType = typeof validTabs[number]
  const tabParam = searchParams.get('tab')
  const activeTab: TabType = validTabs.includes(tabParam as TabType) ? (tabParam as TabType) : 'all'

  const status = searchParams.get('status') || 'ALL'
  const screenedStatus = searchParams.get('screenedStatus') || 'ALL'
  const positionId = searchParams.get('positionId') || ''
  const resumeSourceId = searchParams.get('resumeSourceId') || ''
  const emailConfigId = searchParams.get('emailConfigId') || ''
  const search = searchParams.get('search') || ''
  const dateFrom = searchParams.get('dateFrom') || ''
  const dateTo = searchParams.get('dateTo') || ''
  const sortBy = searchParams.get('sortBy') || ''
  const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc'
  const page = Number(searchParams.get('page')) || 1
  const pageSize = Number(searchParams.get('pageSize')) || 20

  // 通用的 URL 参数更新方法（同时保存到当前 tab 的独立存储）
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
    // 保存到当前 tab 的独立存储（不含 tab 参数本身）
    try {
      const tabParams = new URLSearchParams(queryStr)
      tabParams.delete('tab')
      sessionStorage.setItem(`${TAB_STORAGE_PREFIX}${activeTab}`, tabParams.toString())
      sessionStorage.setItem(ACTIVE_TAB_KEY, activeTab)
    } catch {}
    router.replace(`/resume/list?${queryStr}`, { scroll: false })
  }, [router, searchParams, activeTab])

  const setActiveTab = useCallback((newTab: TabType) => {
    // 保存当前 tab 的所有筛选参数（不含 tab 本身）
    try {
      const currentParams = new URLSearchParams(searchParams.toString())
      currentParams.delete('tab')
      sessionStorage.setItem(`${TAB_STORAGE_PREFIX}${activeTab}`, currentParams.toString())
      sessionStorage.setItem(ACTIVE_TAB_KEY, newTab)
    } catch {}
    // 加载目标 tab 之前保存的筛选参数
    let savedParams = ''
    try {
      savedParams = sessionStorage.getItem(`${TAB_STORAGE_PREFIX}${newTab}`) || ''
    } catch {}
    const params = new URLSearchParams(savedParams)
    params.set('tab', newTab)
    router.replace(`/resume/list?${params.toString()}`, { scroll: false })
  }, [router, searchParams, activeTab])

  const setStatus = useCallback((v: string) => updateParams({ status: v, page: '' }), [updateParams])
  const setScreenedStatus = useCallback((v: string) => updateParams({ screenedStatus: v, page: '' }), [updateParams])
  const setPositionId = useCallback((v: string) => updateParams({ positionId: v, page: '' }), [updateParams])
  const setResumeSourceId = useCallback((v: string) => updateParams({ resumeSourceId: v, page: '' }), [updateParams])
  const setEmailConfigId = useCallback((v: string) => updateParams({ emailConfigId: v, page: '' }), [updateParams])
  const setSearch = useCallback((v: string) => updateParams({ search: v, page: '' }), [updateParams])
  const setDateFrom = useCallback((v: string) => updateParams({ dateFrom: v, page: '' }), [updateParams])
  const setDateTo = useCallback((v: string) => updateParams({ dateTo: v, page: '' }), [updateParams])
  const setSortBy = useCallback((v: string) => updateParams({ sortBy: v }), [updateParams])
  const setSortOrder = useCallback((v: 'asc' | 'desc') => updateParams({ sortOrder: v }), [updateParams])
  const setPage = useCallback((v: number) => updateParams({ page: v > 1 ? String(v) : '' }), [updateParams])
  const setPageSize = useCallback((size: number) => updateParams({ pageSize: String(size), page: '' }), [updateParams])

  // 搜索框本地状态（避免 IME 输入法冲突）
  const [searchInput, setSearchInput] = useState(search)
  const isComposingRef = useRef(false)

  // URL search 参数变化时同步到本地
  useEffect(() => {
    if (!isComposingRef.current) {
      setSearchInput(search)
    }
  }, [search])

  // 构建当前列表页的完整 URL，用于详情页返回
  const currentListUrl = `/resume/list?${searchParams.toString()}`

  const [resumes, setResumes] = useState<ResumeItem[]>([])
  const [pagination, setPagination] = useState<ResumeListPagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  })
  const [positions, setPositions] = useState<PositionOption[]>([])
  const [resumeSources, setResumeSources] = useState<FilterOption[]>([])
  const [emailConfigs, setEmailConfigs] = useState<FilterOption[]>([])
  const [loading, setLoading] = useState(true)
  const [screenAllDialogOpen, setScreenAllDialogOpen] = useState(false)
  const [batchScreening, setBatchScreening] = useState(false)
  const [batchReparsing, setBatchReparsing] = useState(false)
  const [batchParsing, setBatchParsing] = useState(false)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [matchingId, setMatchingId] = useState<string | null>(null)
  const [reparsingId, setReparsingId] = useState<string | null>(null)
  const [batchMatching, setBatchMatching] = useState(false)

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 构建列表 API 查询参数（筛选 + 排序，不含分页），供列表加载与详情页导航快照共用
  const buildApiParams = useCallback(() => {
    const params = new URLSearchParams()

    // Tab 默认筛选条件
    if (activeTab === 'unassigned') {
      params.set('positionId', 'UNASSIGNED')
    } else if (activeTab === 'error') {
      params.set('status', 'ERROR')
    }

    // 用户手动筛选条件（覆盖 tab 默认值）
    if (activeTab === 'all') {
      if (status === 'UNASSIGNED') {
        params.set('positionId', 'UNASSIGNED')
      } else if (status !== 'ALL') {
        params.set('status', status)
      }
      if (positionId) params.set('positionId', positionId)
    }
    if (activeTab === 'error') {
      if (positionId) params.set('positionId', positionId)
    }
    if (resumeSourceId) params.set('resumeSourceId', resumeSourceId)
    if (emailConfigId) params.set('emailConfigId', emailConfigId)
    if (search) params.set('search', search)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    if (sortBy) {
      params.set('sortBy', sortBy)
      params.set('sortOrder', sortOrder)
    }
    return params
  }, [activeTab, status, positionId, resumeSourceId, emailConfigId, search, dateFrom, dateTo, sortBy, sortOrder])

  const loadResumes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const params = buildApiParams()
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))

      const res = await fetch(`/api/resumes?${params}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setResumes(json.resumes)
      setPagination(json.pagination)
      if (!silent) setSelectedIds(new Set())
    } catch (err: unknown) {
      if (!silent) {
        const msg = apiErrorMessage(err, '加载失败，请稍后重试')
        toast.error(msg)
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [buildApiParams, page, pageSize])

  const loadFilters = useCallback(async () => {
    try {
      const [posRes, srcRes, emailRes] = await Promise.all([
        fetch('/api/positions'),
        fetch('/api/config/resume-sources'),
        fetch('/api/config/email'),
      ])
      const posJson = await posRes.json()
      const srcJson = await srcRes.json()
      const emailJson = await emailRes.json()
      setPositions(posJson.positions || [])
      setResumeSources((srcJson.sources || []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })))
      setEmailConfigs((emailJson.configs || []).map((c: { id: string; alias: string }) => ({ id: c.id, alias: c.alias })))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadFilters()
  }, [loadFilters])

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

  useEffect(() => {
    loadResumes()
  }, [loadResumes])

  const handleBatchScreen = async () => {
    if (selectedIds.size === 0) {
      toast.warning('请先选择要筛选的简历')
      return
    }
    // 筛出选中且状态允许筛选的简历（待筛选、已通过、未通过）
    const screenableStatuses = ['PENDING', 'SCREENED']
    const screenableIds = resumes
      .filter((r) => selectedIds.has(r.id) && screenableStatuses.includes(r.status))
      .map((r) => r.id)
    if (screenableIds.length === 0) {
      toast.warning('选中的简历中没有可筛选的简历')
      return
    }
    setBatchScreening(true)
    try {
      const res = await fetch('/api/resumes/batch-screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: screenableIds }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success(`已提交 ${json.queued} 份简历到筛选队列`)
      setActiveTab('all')
    } catch (err: unknown) {
      const msg = apiErrorMessage(err, '批量筛选失败，请稍后重试')
      toast.error(msg)
    } finally {
      setBatchScreening(false)
    }
  }

  const handleBatchScreenAll = async () => {
    if (batchScreening) return
    setBatchScreening(true)
    try {
      const res = await fetch('/api/resumes/batch-screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success(`已提交 ${json.queued} 份简历到筛选队列`)
      loadResumes()
    } catch (err: unknown) {
      const msg = apiErrorMessage(err, '操作失败，请稍后重试')
      toast.error(msg)
    } finally {
      setBatchScreening(false)
    }
  }

  const handleBatchForceReparse = async () => {
    if (selectedIds.size === 0) return
    setBatchReparsing(true)
    try {
      const res = await fetch('/api/resumes/batch-reparse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), force: true }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success(`已提交 ${json.queued} 份简历到解析队列，批次 ${json.batchNo}`)
      loadResumes()
    } catch (err: unknown) {
      const msg = apiErrorMessage(err, '批量解析失败，请稍后重试')
      toast.error(msg)
    } finally {
      setBatchReparsing(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === resumes.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(resumes.map((r) => r.id)))
    }
  }

  const handleAssignPosition = async (resumeId: string, positionId: string) => {
    if (!positionId) return
    setAssigningId(resumeId)
    try {
      const res = await fetch(`/api/resumes/${resumeId}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      if (activeTab === 'unassigned') {
        // 未分配选项卡下，分配后刷新列表以移除已分配的项
        loadResumes()
      } else {
        // 其他选项卡本地更新即可
        setResumes((prev) =>
          prev.map((r) =>
            r.id === resumeId
              ? { ...r, position: { id: positionId, title: positions.find((p) => p.id === positionId)?.title || '' } }
              : r
          )
        )
      }
      toast.success('职位已分配')
    } catch (err: unknown) {
      const msg = apiErrorMessage(err, '分配失败，请稍后重试')
      toast.error(msg)
    } finally {
      setAssigningId(null)
    }
  }

  const handleMatchPosition = async (resumeId: string) => {
    setMatchingId(resumeId)
    try {
      const res = await fetch(`/api/resumes/${resumeId}/match-position`, {
        method: 'POST',
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      if (json.matched) {
        if (activeTab === 'unassigned') {
          loadResumes()
        } else {
          setResumes((prev) =>
            prev.map((r) =>
              r.id === resumeId
                ? { ...r, position: { id: json.position.id, title: json.position.title } }
                : r
            )
          )
        }
        toast.success(`已匹配到职位: ${json.position.title}`)
      } else {
        toast.warning(json.message || '未匹配到职位，请手动选择')
      }
    } catch (err: unknown) {
      const msg = apiErrorMessage(err, '匹配失败，请稍后重试')
      toast.error(msg)
    } finally {
      setMatchingId(null)
    }
  }

  const handleBatchMatchPosition = async () => {
    setBatchMatching(true)
    try {
      const body: Record<string, unknown> = {}
      if (selectedIds.size > 0) {
        body.ids = Array.from(selectedIds)
      }
      const res = await fetch('/api/resumes/batch-match-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success(
        `批量匹配完成: ${json.matched}/${json.total} 成功` +
          (json.failed > 0 ? `，${json.failed} 个未匹配` : '')
      )
      loadResumes()
    } catch (err: unknown) {
      const msg = apiErrorMessage(err, '批量匹配失败，请稍后重试')
      toast.error(msg)
    } finally {
      setBatchMatching(false)
    }
  }

  const handleParse = async (resumeId: string) => {
    setReparsingId(resumeId)
    try {
      const res = await fetch('/api/resumes/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeId }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success('已加入解析队列')
      loadResumes()
    } catch (err: unknown) {
      const msg = apiErrorMessage(err, '解析失败，请稍后重试')
      toast.error(msg)
    } finally {
      setReparsingId(null)
    }
  }

  const handleBatchParse = async () => {
    if (selectedIds.size === 0) {
      toast.warning('请先选择要解析的简历')
      return
    }
    setBatchParsing(true)
    try {
      const res = await fetch('/api/resumes/batch-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeIds: Array.from(selectedIds) }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success(`已加入解析队列: ${json.queued} 份简历`)
      setSelectedIds(new Set())
      loadResumes()
    } catch (err: unknown) {
      const msg = apiErrorMessage(err, '批量解析失败，请稍后重试')
      toast.error(msg)
    } finally {
      setBatchParsing(false)
    }
  }

  return (
    <ResumePageShell>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">简历列表</h2>
          <Button
            onClick={() => loadResumes()}
            disabled={loading}
            variant="ghost"
            size="icon"
            title="刷新列表"
            className="hover:bg-primary hover:text-primary-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <ResumeBatchActions
          selectedCount={selectedIds.size}
          batchMatching={batchMatching}
          batchReparsing={batchReparsing}
          batchScreening={batchScreening}
          onBatchMatchPosition={handleBatchMatchPosition}
          onBatchForceReparse={handleBatchForceReparse}
          onBatchScreen={handleBatchScreen}
          onScreenAll={() => setScreenAllDialogOpen(true)}
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b">
        {([
          { key: 'all', label: '所有' },
          { key: 'unassigned', label: '未分配' },
          { key: 'error', label: '异常' },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key)
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <ResumeFilterBar
        searchInput={searchInput}
        onSearchTextChange={setSearchInput}
        onSearchCommit={setSearch}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        activeTab={activeTab}
        status={status}
        onStatusChange={setStatus}
        positionId={positionId}
        onPositionIdChange={setPositionId}
        positions={positions}
        resumeSourceId={resumeSourceId}
        onResumeSourceIdChange={setResumeSourceId}
        resumeSources={resumeSources}
        emailConfigId={emailConfigId}
        onEmailConfigIdChange={setEmailConfigId}
        emailConfigs={emailConfigs}
      />

      {/* 候选人卡片流 */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
      ) : resumes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="暂无简历数据"
          description="配置邮箱并执行一次收取后，系统会自动解析简历并显示在这里。"
        />
      ) : (
        <>
          {/* 排序工具栏 + 全选 */}
          <ResumeListToolbar
            total={pagination.total}
            selectedCount={selectedIds.size}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortToggle={(field) => {
              if (sortBy === field) {
                updateParams({ sortOrder: sortOrder === 'desc' ? 'asc' : 'desc', page: '' })
              } else {
                updateParams({ sortBy: field, sortOrder: 'desc', page: '' })
              }
            }}
            allSelected={selectedIds.size === resumes.length && resumes.length > 0}
            onToggleSelectAll={toggleSelectAll}
          />

          {/* 卡片列表 */}
          <div className="space-y-2">
            {resumes.map((resume) => (
              <ResumeListItemCard
                key={resume.id}
                resume={resume}
                selected={selectedIds.has(resume.id)}
                positionId={positionId}
                positions={positions}
                matchingId={matchingId}
                assigningId={assigningId}
                onToggleSelect={toggleSelect}
                onOpen={(r) => { writeNavSnapshot(); router.push(`/resume/detail/${r.id}?from=${encodeURIComponent(currentListUrl)}`) }}
                onMatchPosition={handleMatchPosition}
                onAssignPosition={handleAssignPosition}
              />
            ))}
          </div>

          {/* Pagination */}
          <Pagination
            page={page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={pageSize}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={setPageSize}
          />
        </>
      )}

      {/* 全部AI筛选确认弹窗 */}
      <Dialog open={screenAllDialogOpen} onOpenChange={setScreenAllDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>确认全部AI筛选</DialogTitle>
            <DialogDescription className="pt-3 space-y-3" asChild>
              <div>
                <p>此操作将对<strong>当前列表中的所有待筛选简历</strong>执行 AI 筛选，具体影响如下：</p>
                <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-5">
                  <li>状态为「待筛选」「已通过」「未通过」的简历将被重新提交到 AI 筛选队列</li>
                  <li>已通过的简历<strong>会被覆盖</strong>，原有的筛选结果将丢失</li>
                  <li>筛选过程不可中途取消，完成后将自动刷新列表</li>
                </ul>
                <p className="text-sm font-medium text-destructive">
                  请确认您确实要对全部简历执行此操作
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setScreenAllDialogOpen(false)}
              disabled={batchScreening}
            >
              取消
            </Button>
            <Button
              onClick={() => {
                setScreenAllDialogOpen(false)
                handleBatchScreenAll()
              }}
              disabled={batchScreening}
              variant="default"
            >
              {batchScreening ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  筛选中...
                </>
              ) : (
                '确认筛选'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ResumePageShell>
  )
}

export default function ResumeListPage() {
  return (
    <Suspense>
      <ResumeListPageInner />
    </Suspense>
  )
}
