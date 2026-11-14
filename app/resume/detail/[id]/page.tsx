'use client'

import { useEffect, useState, useCallback, useRef, useMemo, use, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { DIMENSION_KEYS, type DimensionKey } from '@/lib/constants/evaluation'
import {
  getResumeNavSnapshot,
  saveResumeNavSnapshot,
  appendNextResumePage,
  type ResumeNavSnapshot,
} from '@/lib/resume-nav'
import { FollowUpDialog } from '@/components/resume/FollowUpDialog'
import { UnsuitableDialog } from '@/components/resume/UnsuitableDialog'
import { DimensionEvaluator } from '@/components/resume/DimensionEvaluator'
import { ResumeDetailToolbar } from '@/components/resume/ResumeDetailToolbar'
import { ResumeDetailHeader } from '@/components/resume/ResumeDetailHeader'
import { ResumeDetailTabs } from '@/components/resume/ResumeDetailTabs'
import { ResumeDetailEvaluationTab } from '@/components/resume/ResumeDetailEvaluationTab'
import { ResumeDetailTextTab } from '@/components/resume/ResumeDetailTextTab'
import { ResumeDetailErrorTab } from '@/components/resume/ResumeDetailErrorTab'
import { ResumeDetailStructuredTab } from '@/components/resume/ResumeDetailStructuredTab'
import type { PositionOption } from '@/types/resume'
import type {
  ResumeDetail,
  ResumeDetailEvaluation,
  EvaluationData,
  ResumeDetailTab,
} from '@/types/resume-detail'

function ResumeDetailPageInner({ id }: { id: string }) {
  const searchParams = useSearchParams()
  const backUrl = searchParams.get('from') || '/resume/list'
  const router = useRouter()
  const from = searchParams.get('from')
  const [resume, setResume] = useState<ResumeDetail | null>(null)
  const [positions, setPositions] = useState<PositionOption[]>([])
  const [loading, setLoading] = useState(true)
  const [screening, setScreening] = useState(false)
  const [reparsing, setReparsing] = useState(false)
  const [refetching, setRefetching] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [activeTab, setActiveTab] = useState<ResumeDetailTab>('evaluation')
  const [extracting, setExtracting] = useState(false)

  // 评估相关状态
  const [evaluations, setEvaluations] = useState<EvaluationData[]>([])
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null)
  const [loadingEvaluations, setLoadingEvaluations] = useState(false)

  // 评分编辑框状态
  const [evaluatorOpen, setEvaluatorOpen] = useState(false)
  const [evaluatingDimension, setEvaluatingDimension] = useState<DimensionKey | null>(null)

  // 跟进弹窗状态
  const [followUpOpen, setFollowUpOpen] = useState(false)

  // 标记是否首次加载（防止 loadResume 在评估期间重置职位选择）
  const isInitialLoadRef = useRef(true)

  // 不合适弹窗状态
  const [unsuitableOpen, setUnsuitableOpen] = useState(false)

  // 连续浏览导航（上一份/下一份），来自列表页跳转时写入的 sessionStorage 快照
  const [navSnap, setNavSnap] = useState<ResumeNavSnapshot | null>(() => getResumeNavSnapshot())
  const [navAppending, setNavAppending] = useState(false)
  const navBusyRef = useRef(false)

  // 判断是否从已筛选页面进入
  const isFromScreened = useMemo(() => {
    return from?.includes('/resume/screened') || false
  }, [from])

  // 评分权限控制
  const editableDimensions = useMemo(() => {
    // 从 from 参数中提取 tab 值（格式可能是 "/resume/follow-up?tab=INTERVIEW_SCHEDULED" 或直接是 "screened"）
    let tabValue = from || ''
    if (tabValue.includes('tab=')) {
      const match = tabValue.match(/tab=([^&]+)/)
      if (match) tabValue = match[1]
    }
    // 统一转小写并处理下划线转连字符
    const normalizedFrom = tabValue.toLowerCase().replace(/_/g, '-')
    switch (normalizedFrom) {
      case 'interview-scheduled':
      case 'interviewed':
        return DIMENSION_KEYS  // 全部可编辑
      case 'screened':
      case 'contacting':
      default:
        return ['knowledge', 'skill']  // 仅知识和技能
    }
  }, [from])

  const loadResume = useCallback(async () => {
    try {
      const res = await fetch(`/api/resumes/${id}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setResume(json.resume)
      // 初始化职位选择：仅在首次加载时设置，后续刷新保留用户当前选择
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false
        const initialPosId = searchParams.get('positionId')
        if (initialPosId && !initialPosId.includes(',')) {
          setSelectedPositionId(initialPosId)
        } else if (json.resume?.positionId) {
          setSelectedPositionId(json.resume.positionId)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载失败'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [id, searchParams])

  // 获取评估维度数据
  const fetchEvaluations = useCallback(async (resumeId: string, positionId?: string | null) => {
    setLoadingEvaluations(true)
    try {
      const params = new URLSearchParams({ resumeId })
      if (positionId) params.append('positionId', positionId)
      const res = await fetch(`/api/evaluations?${params}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      const evals = json.evaluations || []
      setEvaluations(evals)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '获取评估数据失败'
      toast.error(msg)
    } finally {
      setLoadingEvaluations(false)
    }
  }, [])

  // 切换简历时通过组件重挂载（key）复位全部状态，此处不再需要手动重置

  useEffect(() => {
    loadResume()
    fetch('/api/positions').then((r) => r.json()).then((posJson) => {
      setPositions(posJson.positions || [])
    }).catch(() => {})
  }, [loadResume])

  // 当职位或权重模型变化时，重新获取评估数据
  useEffect(() => {
    if (selectedPositionId !== undefined) {
      fetchEvaluations(id, selectedPositionId)
    }
  }, [id, selectedPositionId, fetchEvaluations])

  // ── 连续浏览导航 ──
  const navIndex = navSnap ? navSnap.ids.indexOf(id) : -1
  const hasNav = navIndex >= 0
  // 快照末尾是否还能追加拉取下一页
  const canAppendMore = !!navSnap?.apiUrl && !!navSnap.idSource && navSnap.page < navSnap.totalPages

  const goToResume = useCallback((targetId: string) => {
    // 保留 from / positionId 等现有查询参数，仅替换简历 id
    const params = new URLSearchParams(searchParams.toString())
    window.scrollTo(0, 0)
    router.replace('/resume/detail/' + targetId + '?' + params.toString(), { scroll: false })
  }, [router, searchParams])

  // 翻到下一份；快照末尾时自动追加拉取下一页。
  // 返回是否发生了跳转，供跟进/不合适操作成功后的自动流转复用。
  const goNext = useCallback(async (): Promise<boolean> => {
    if (!navSnap || navBusyRef.current) return false
    const idx = navSnap.ids.indexOf(id)
    if (idx < 0) return false
    if (idx < navSnap.ids.length - 1) {
      goToResume(navSnap.ids[idx + 1])
      return true
    }
    if (!canAppendMore) return false
    navBusyRef.current = true
    setNavAppending(true)
    try {
      const updated = await appendNextResumePage(navSnap)
      saveResumeNavSnapshot(updated)
      setNavSnap(updated)
      const nextId = updated.ids[idx + 1]
      if (nextId) {
        goToResume(nextId)
        return true
      }
      // 追加页的 id 均已存在（列表数据漂移），本次未跳转；快照页码已前进，可再次点击重试
      return false
    } catch {
      toast.error('加载更多失败，请重试')
      return false
    } finally {
      navBusyRef.current = false
      setNavAppending(false)
    }
  }, [navSnap, id, goToResume, canAppendMore])

  const goPrev = useCallback(() => {
    if (!navSnap) return
    const idx = navSnap.ids.indexOf(id)
    if (idx > 0) goToResume(navSnap.ids[idx - 1])
  }, [navSnap, id, goToResume])

  // 键盘 ←/→ 翻页：输入元素聚焦、弹层打开或追加进行中时忽略
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (followUpOpen || unsuitableOpen || evaluatorOpen || navAppending) return
      const target = e.target as HTMLElement | null
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return
      e.preventDefault()
      if (e.key === 'ArrowLeft') goPrev()
      else void goNext()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [followUpOpen, unsuitableOpen, evaluatorOpen, navAppending, goPrev, goNext])


  const handleReparse = async () => {
    setReparsing(true)
    try {
      const res = await fetch(`/api/resumes/${id}/reparse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success('重新解析成功')
      loadResume()
      setActiveTab('text')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '解析失败'
      toast.error(msg)
      // 解析失败后刷新数据，后端已将状态设为 ERROR
      await loadResume()
      setActiveTab('error')
    } finally {
      setReparsing(false)
    }
  }

  const handleRefetch = async () => {
    setRefetching(true)
    try {
      const res = await fetch(`/api/resumes/${id}/refetch`, { method: 'POST' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success('重新获取成功')
      loadResume()
      setActiveTab('text')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '获取失败'
      toast.error(msg)
    } finally {
      setRefetching(false)
    }
  }

  const handleScreen = async () => {
    setScreening(true)
    try {
      const payload: Record<string, string> = {}
      if (selectedPositionId) payload.positionId = selectedPositionId
      const res = await fetch(`/api/resumes/${id}/screen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success('已提交评估，请等待处理...')
      await loadResume()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '评估失败'
      toast.error(msg)
    } finally {
      setScreening(false)
    }
  }

  const handleExtractStructured = async () => {
    setExtracting(true)
    try {
      const res = await fetch(`/api/resumes/${id}/extract`, { method: 'POST' })

      // 检查响应状态
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `请求失败 (${res.status})`)
      }

      // 解析 JSON
      let json: { error?: string; success?: boolean; data?: unknown }
      try {
        json = await res.json()
      } catch {
        throw new Error('服务器返回了无效的响应')
      }

      if (json.error) throw new Error(json.error)
      toast.success('结构化数据提取成功')
      loadResume()
      setActiveTab('structured')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '提取失败'
      toast.error(msg)
    } finally {
      setExtracting(false)
    }
  }

  // 轮询：当简历状态为 SCREENING 时每10秒刷新一次
  const prevStatusRef = useRef<string | null>(null)
  const loadResumeRef = useRef(loadResume)
  loadResumeRef.current = loadResume

  useEffect(() => {
    const currentStatus = resume?.status ?? null

    // 检测状态从 SCREENING 变为其他状态时的提示（异步，等待评估数据刷新）
    const handleStatusChange = async () => {
      if (prevStatusRef.current === 'SCREENING' && currentStatus && currentStatus !== 'SCREENING') {
        if (currentStatus === 'SCREENED') {
          toast.success('评估完成')
          loadResumeRef.current()
          await fetchEvaluations(id, selectedPositionId)
          setActiveTab('evaluation')
        } else if (currentStatus === 'ERROR') {
          toast.error('AI筛选出错')
          loadResumeRef.current()
          setActiveTab('error')
        }
      }
      prevStatusRef.current = currentStatus
    }

    handleStatusChange()

    if (currentStatus !== 'SCREENING') return

    const intervalId = setInterval(() => loadResumeRef.current(), 10000)
    return () => clearInterval(intervalId)
  }, [resume?.status])

  const handleAssign = async (positionId: string) => {
    if (!positionId) return
    setAssigning(true)
    try {
      const res = await fetch(`/api/resumes/${id}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success('职位分配成功')
      loadResume()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '分配失败'
      toast.error(msg)
    } finally {
      setAssigning(false)
    }
  }

  // 处理维度点击（打开评分弹窗）
  const handleDimensionClick = (dimension: string) => {
    setEvaluatingDimension(dimension as DimensionKey)
    setEvaluatorOpen(true)
  }

  // 评分保存后的回调
  const handleEvaluationSave = () => {
    fetchEvaluations(id, selectedPositionId)
  }

  // 解析 AI 标签名数组（稳定引用，避免 FollowUpDialog 重复触发 effect）
  // 注意：必须放在所有条件 return 之前，否则 React Hooks 数量不一致会报错
  const aiTagNames = useMemo(() => {
    try {
      const tags = resume?.evaluations?.[0]?.aiTags
      const result = tags ? (JSON.parse(tags) as string[]) : []
      return result
    } catch { return [] }
  }, [resume?.evaluations?.[0]?.aiTags])

  // 构建多岗位评分列表供 FollowUpDialog 使用
  const detailPositionScores = useMemo(() => {
    if (!resume?.evaluations) return []
    const seen = new Set<string>()
    return resume.evaluations
      .filter((e): e is ResumeDetailEvaluation & { position: NonNullable<ResumeDetailEvaluation['position']> } => e.position !== null)
      .filter(e => {
        if (seen.has(e.position.id)) return false
        seen.add(e.position.id)
        return true
      })
      .map(e => ({
        positionId: e.position.id,
        positionTitle: e.position.title,
        evaluationId: e.id,
        hasFollowUp: !!e.followUpRecord,
        initialScore: e.initialScore ?? null,
        compositeScore: e.compositeScore ?? null,
      }))
  }, [resume?.evaluations])

  // 根据当前选中的岗位确定默认 evaluationId
  const detailDefaultEvalId = useMemo(() => {
    if (!selectedPositionId || !resume?.evaluations) return undefined
    const eval_ = resume.evaluations.find(e => e.positionId === selectedPositionId)
    return eval_?.id || undefined
  }, [selectedPositionId, resume?.evaluations])

  // 根据当前评估确定是否有已有 FollowUpRecord
  const existingFollowUpRecordId = useMemo(() => {
    if (!selectedPositionId || !resume?.evaluations) return undefined
    const eval_ = resume.evaluations.find(e => e.positionId === selectedPositionId)
    return eval_?.followUpRecord?.id || undefined
  }, [selectedPositionId, resume?.evaluations])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!resume) {
    return (
      <div className="p-6 text-center text-muted-foreground">简历不存在</div>
    )
  }

  const result: ResumeDetailEvaluation | null =
    resume.evaluations?.find(e => e.positionId === selectedPositionId) || null

  // 跟进 / 不合适成功后的自动流转：有导航快照时翻下一份，翻不动时返回列表
  const afterActionSuccess = async () => {
    const moved = await goNext()
    if (!moved) router.push(backUrl)
  }

  return (
    <div className="p-6 space-y-6">
      {/* ── 顶部工具条（仅导航 + 操作，信息全部下移到候选人卡片） ── */}
      <ResumeDetailToolbar
        backUrl={backUrl}
        resumeStatus={resume.status}
        positionTitle={resume.position?.title ?? null}
        positions={positions}
        selectedPositionId={selectedPositionId}
        onSelectPosition={setSelectedPositionId}
        showPositionControls={activeTab === 'evaluation'}
        hasExtractedText={!!resume.extractedText}
        screening={screening}
        onScreen={handleScreen}
        refetching={refetching}
        reparsing={reparsing}
        onRefetch={handleRefetch}
        onReparse={handleReparse}
        isFromScreened={isFromScreened}
        onFollowUp={() => setFollowUpOpen(true)}
        onUnsuitable={() => setUnsuitableOpen(true)}
        nav={{
          visible: hasNav,
          index: navIndex,
          total: navSnap?.ids.length ?? 0,
          appending: navAppending,
          canAppendMore,
          onPrev: goPrev,
          onNext: () => void goNext(),
        }}
      />

      {/* ── 候选人卡片 ── */}
      <ResumeDetailHeader
        resume={resume}
        positions={positions}
        assigning={assigning}
        onAssign={handleAssign}
        result={result}
        onNameSaved={loadResume}
      />

      {/* ── Tabs ── */}
      <ResumeDetailTabs
        activeTab={activeTab}
        onChange={setActiveTab}
        hasStructuredData={!!resume.structuredData}
        showError={resume.status === 'ERROR'}
      />

      {/* ── Tab content ── */}
      {activeTab === 'evaluation' && (
        <ResumeDetailEvaluationTab
          evaluations={evaluations}
          editableDimensions={editableDimensions}
          loadingEvaluations={loadingEvaluations}
          onDimensionClick={handleDimensionClick}
          selectedPositionId={selectedPositionId}
        />
      )}

      {activeTab === 'text' && (
        <ResumeDetailTextTab
          resumeId={resume.id}
          fileType={resume.fileType}
          fileName={resume.fileName}
          extractedText={resume.extractedText}
          reparsing={reparsing}
          onReparse={handleReparse}
        />
      )}

      {activeTab === 'error' && resume.status === 'ERROR' && (
        <ResumeDetailErrorTab
          errorMessage={resume.errorMessage}
          refetching={refetching}
          reparsing={reparsing}
          onRefetch={handleRefetch}
          onReparse={handleReparse}
        />
      )}

      {activeTab === 'structured' && (
        <ResumeDetailStructuredTab
          structuredData={resume.structuredData}
          extracting={extracting}
          onExtract={handleExtractStructured}
        />
      )}

      {/* 评分内联编辑框 */}
      {evaluatingDimension && (
        <DimensionEvaluator
          resumeId={id}
          positionId={selectedPositionId}
          dimension={evaluatingDimension}
          rating={evaluations.find(e => e.dimension === evaluatingDimension)?.rating ?? null}
          comment={evaluations.find(e => e.dimension === evaluatingDimension)?.comment ?? null}
          editable={editableDimensions.includes(evaluatingDimension)}
          onSave={handleEvaluationSave}
          open={evaluatorOpen}
          onOpenChange={setEvaluatorOpen}
        />
      )}

      {/* 跟进弹窗 */}
      <FollowUpDialog
        open={followUpOpen}
        onClose={() => setFollowUpOpen(false)}
        resumeId={id}
        resumeName={resume.candidateName || '未知'}
        aiTagNames={aiTagNames}
        positionScores={detailPositionScores}
        defaultEvaluationId={detailDefaultEvalId}
        onSuccess={afterActionSuccess}
      />

      {/* 不合适弹窗 */}
      <UnsuitableDialog
        open={unsuitableOpen}
        onClose={() => setUnsuitableOpen(false)}
        resumeId={id}
        candidateName={resume.candidateName || '未知'}
        recordId={existingFollowUpRecordId}
        evaluationId={detailDefaultEvalId}
        onSuccess={afterActionSuccess}
      />
    </div>
  )
}

export default function ResumeDetailPage(props: { params: Promise<{ id: string }> }) {
  // 使用 use() unwarp Promise，但在 Suspense 边界内
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <ResumeDetailPageWrapper params={props.params} />
    </Suspense>
  )
}

function ResumeDetailPageWrapper({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  // key 按简历 id 强制重挂载，避免翻页切换简历时残留上一份的状态
  return <ResumeDetailPageInner key={id} id={id} />
}
