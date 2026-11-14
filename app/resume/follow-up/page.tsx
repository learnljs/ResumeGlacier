'use client'

import { useEffect, useState, useCallback, Suspense, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { RefreshCw, Download } from 'lucide-react'
import { toast } from 'sonner'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import Link from 'next/link'
import { useScrollPosition } from '@/lib/hooks/use-scroll-position'
import { useFollowUpExport } from '@/lib/hooks/use-follow-up-export'
import { useFollowUpUrlState } from '@/lib/hooks/use-follow-up-url-state'
import { ResumePageShell } from '@/components/resume/PageShell'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { UnsuitableDialog } from '@/components/resume/UnsuitableDialog'
import { FollowUpFilterBar } from '@/components/resume/FollowUpFilterBar'
import { ScheduleDialog, HireDialog, ResignDialog, NoteDialog, ReasonEditDialog, RollbackDialog, InterviewEndDialog, ExportDialog } from '@/components/resume/FollowUpDialogs'
import type { Tag, EvaluationDimension, FollowUpRecordItem, PaginationState } from '@/types/follow-up'
import { FollowUpTable } from '@/components/resume/FollowUpTable'
import { FollowUpLogDrawer } from '@/components/resume/FollowUpLogDrawer'
import { isIcebergRated } from '@/lib/constants/evaluation'
import { contactResultLabel } from '@/lib/constants/contact-result'
import { saveResumeNavSnapshot } from '@/lib/resume-nav'
import { FOLLOW_UP_TABS } from '@/lib/constants/follow-up'
import { formatInterviewTime } from '@/lib/utils/date'

// ==================== 类型定义 ====================
// EvaluationDimension / FollowUpRecordItem / PaginationState 已移至 types/follow-up.ts

// ==================== 常量 ====================
// 页面内的类型 / 常量 / 子组件已分批迁移（B8 / B9 / B13），此处只保留编排逻辑：
// 操作列配置（FOLLOW_UP_ACTIONS / UI_ICON_MAP / UI_COLOR_CLASS_MAP）已移至 components/resume/FollowUpTable.tsx

// 维度中文名来自 EVALUATION_DIMENSIONS、联系结果标签来自 contact-result 单点（B8）

// 日志常量（LOG_ACTION_LABELS / LOG_CATEGORY_MAP / getLogCategory）已移至 components/resume/FollowUpLogDrawer.tsx

// 子组件已提取至 components/resume/（B9：FollowUpTagFilter / ContactedMultiSelect / NoteCell）

// ==================== 主组件 ====================

function FollowUpPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // 查询状态（URL 解析 + 筛选草稿 + 写回）统一由 hook 管理
  const {
    activeTab, search, page, pageSize, sortOrder, currentQueryString,
    selectedTagIds, tagLogic, filterPositionIds, filterDateFrom, filterDateTo, filterContacted,
    activeFilterCount,
    draftTagIds, setDraftTagIds, draftTagLogic, setDraftTagLogic,
    draftPositionIds, setDraftPositionIds, draftDateFrom, setDraftDateFrom,
    draftDateTo, setDraftDateTo, draftContacted, setDraftContacted,
    updateParams, applyFilters, clearFilters, setPage, buildApiParams,
  } = useFollowUpUrlState()

  // 列表数据与筛选抽屉
  const [searchInput, setSearchInput] = useState(search)
  const [records, setRecords] = useState<FollowUpRecordItem[]>([])
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 20, total: 0, totalPages: 0 })
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [filterOpen, setFilterOpen] = useState(false)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [allPositions, setAllPositions] = useState<{ id: string; title: string }[]>([])

  // 弹窗状态
  const [scheduleDialog, setScheduleDialog] = useState<{ open: boolean; recordId: string; candidateName: string }>({ open: false, recordId: '', candidateName: '' })
  const [scheduleTime, setScheduleTime] = useState('')

  // 不合适弹窗状态（替代旧的 rejectDialog + rejectReason）
  const [unsuitableDialog, setUnsuitableDialog] = useState<{ open: boolean; recordId: string; resumeId: string; candidateName: string; title: string; targetStatus: string }>({ open: false, recordId: '', resumeId: '', candidateName: '', title: '', targetStatus: 'UNSUITABLE' })

  const [hireDialog, setHireDialog] = useState<{ open: boolean; recordId: string; candidateName: string; targetStatus: string; title: string; confirmLabel: string }>({ open: false, recordId: '', candidateName: '', targetStatus: 'HIRED', title: '入职', confirmLabel: '确认' })
  const [hireForm, setHireForm] = useState({ startDate: '' })

  // 离职弹窗状态
  const [resignDialog, setResignDialog] = useState<{ open: boolean; recordId: string; candidateName: string }>({ open: false, recordId: '', candidateName: '' })
  const [resignForm, setResignForm] = useState({ resignedAt: '', resignReason: '' })
  const [resignSubmitting, setResignSubmitting] = useState(false)

  // 面试结束弹窗
  const [interviewEndDialog, setInterviewEndDialog] = useState<{ open: boolean; recordId: string; candidateName: string }>({ open: false, recordId: '', candidateName: '' })
  const [interviewEndNote, setInterviewEndNote] = useState('')
  const [interviewEndTagIds, setInterviewEndTagIds] = useState<string[]>([])
  const [interviewEndSubmitting, setInterviewEndSubmitting] = useState(false)
  // 面试结束弹窗内可编辑的维度评分
  const [interviewEndRatings, setInterviewEndRatings] = useState<Record<string, number | null>>({})

  // 日志抽屉
  const [logDrawer, setLogDrawer] = useState<{ open: boolean; recordId: string; candidateName: string; logs: Array<{ id: string; action: string; detail: string | null; createdAt: string }> }>({ open: false, recordId: '', candidateName: '', logs: [] })

  // 抽屉打开时锁定页面滚动，防止背景内容穿透 z-50 叠加层
  useEffect(() => {
    if (logDrawer.open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [logDrawer.open])

  // 备注编辑弹窗
  const [noteDialog, setNoteDialog] = useState<{ open: boolean; recordId: string; candidateName: string }>({ open: false, recordId: '', candidateName: '' })
  const [noteValue, setNoteValue] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)

  // 原因编辑弹窗（不合适拒绝原因 / 拒offer / 取消面试 / 离职原因）
  const [reasonEditDialog, setReasonEditDialog] = useState<{ open: boolean; recordId: string; candidateName: string; field: 'rejectReason' | 'resignReason'; label: string }>({ open: false, recordId: '', candidateName: '', field: 'rejectReason', label: '拒绝原因' })
  const [reasonEditValue, setReasonEditValue] = useState('')
  const [reasonEditSaving, setReasonEditSaving] = useState(false)

  // 回退弹窗
  const [rollbackDialog, setRollbackDialog] = useState<{ open: boolean; recordId: string; candidateName: string; currentStatus: string }>({ open: false, recordId: '', candidateName: '', currentStatus: '' })
  const [rollbackTarget, setRollbackTarget] = useState('')
  const [rollbackReason, setRollbackReason] = useState('')
  const [rollbackSaving, setRollbackSaving] = useState(false)

  // 导出弹窗
  // 导出：字段选择、请求与下载都在 hook 内，页面只保留弹窗开合
  const exportState = useFollowUpExport({
    tagIds: selectedTagIds,
    tagLogic,
    search,
    positionIds: filterPositionIds,
    recordStatus: activeTab,
    dateFrom: filterDateFrom,
    dateTo: filterDateTo,
    contacted: filterContacted,
  })

  // 滚动位置记忆
  // 确保 storageKey 包含 tab 参数（即使 URL 中未显式包含），与详情页 Link 的 from 参数保持一致
  const effectiveStorageKey = useMemo(() => {
    const params = new URLSearchParams(currentQueryString)
    if (!params.has('tab') && activeTab) params.set('tab', activeTab)
    return `/resume/follow-up?${params.toString()}`
  }, [currentQueryString, activeTab])

  const { save: saveScrollPos, restore: restoreScrollPos } = useScrollPosition({
    storageKey: effectiveStorageKey,
    page,
    onBackToPrevPage: () => setPage(page - 1),
  })

  const pendingRestoreRef = useRef<number | null>(null)

  // loadRecords 完成后恢复滚动位置（loading 从 true → false 时触发）
  useEffect(() => {
    if (!loading && pendingRestoreRef.current !== null) {
      restoreScrollPos(pendingRestoreRef.current)
      pendingRestoreRef.current = null
    }
  }, [loading, restoreScrollPos])


  // 加载数据
  const loadRecords = useCallback(async () => {
    setLoading(true)
    try {
      const params = buildApiParams()
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))

      const res = await fetch(`/api/follow-up/records?${params}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setRecords(json.records)
      setPagination(json.pagination)
      pendingRestoreRef.current = json.records.length
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载失败'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [buildApiParams, page, pageSize])

  // 写入详情页连续浏览导航快照（跳转详情前调用）
  const writeNavSnapshot = useCallback(() => {
    const ids = records.map((r) => r.resume?.id).filter((v): v is string => !!v)
    if (ids.length === 0) return
    saveResumeNavSnapshot({
      ids,
      page,
      pageSize,
      totalPages: pagination.totalPages,
      apiUrl: '/api/follow-up/records?' + buildApiParams().toString(),
      idSource: 'follow-up',
    })
  }, [records, page, pageSize, pagination.totalPages, buildApiParams])

  // 加载统计
  const loadCounts = useCallback(async () => {
    try {
      const results = await Promise.all(
        ['CONTACTING', 'INTERVIEW_SCHEDULED', 'INTERVIEWED'].map(async (status) => {
          const res = await fetch(`/api/follow-up/records?recordStatus=${status}&pageSize=1`)
          const json = await res.json()
          return { status, count: json.pagination?.total || 0 }
        })
      )
      const newCounts: Record<string, number> = {}
      results.forEach(({ status, count }) => { newCounts[status] = count })
      setCounts(newCounts)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => { loadRecords() }, [loadRecords])
  useEffect(() => { loadCounts() }, [loadCounts])

  // 页面隐藏时保存滚动位置，重新可见时重新加载（从详情页返回时）
  // 注意：visibilitychange 只在 tab 级切换时触发，SPA 导航不触发
  // 组件卸载时的保存由下方的 cleanup effect 负责
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadRecords()
      } else {
        saveScrollPos()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [loadRecords, saveScrollPos])

  // 点击任意元素时保存滚动位置（click 事件在 SPA Link 导航之前同步执行，保证 DOM 完整）
  useEffect(() => {
    const handleClick = () => { saveScrollPos() }
    document.addEventListener('click', handleClick, { capture: true })
    return () => document.removeEventListener('click', handleClick, { capture: true })
  }, [saveScrollPos])

  // 加载标签列表
  useEffect(() => {
    fetch('/api/follow-up/tags')
      .then((res) => res.json())
      .then((json) => { if (json.tags) setAllTags(json.tags) })
      .catch(() => {})
  }, [])

  // 加载职位列表
  useEffect(() => {
    fetch('/api/positions')
      .then((res) => res.json())
      .then((json) => { if (json.positions) setAllPositions(json.positions) })
      .catch(() => {})
  }, [])

  // ==================== 操作处理 ====================

  // 预约面试
  const handleScheduleInterview = async () => {
    if (!scheduleTime) {
      toast.error('请选择面试时间')
      return
    }
    try {
      const res = await fetch(`/api/follow-up/records/${scheduleDialog.recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'INTERVIEW_SCHEDULED', interviewTime: scheduleTime }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('预约面试成功')
      setScheduleDialog({ open: false, recordId: '', candidateName: '' })
      setScheduleTime('')
      loadRecords()
      loadCounts()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    }
  }

  // 面试结束 - 打开确认弹窗
  const handleInterviewEnd = (recordId: string) => {
    const record = records.find(r => r.id === recordId)
    if (!record) return
    setInterviewEndDialog({ open: true, recordId, candidateName: record.resume.candidateName || '未知' })
    setInterviewEndNote(record.note || '')
    setInterviewEndTagIds(record.tags.map(t => t.followUpTag.id))
    // 初始化当前评分
    const ratings: Record<string, number | null> = {}
    for (const dim of ['knowledge', 'skill', 'selfAwareness', 'personality', 'values', 'motivation']) {
      ratings[dim] = getRating(record.resume.evaluationDimensions, dim)
    }
    setInterviewEndRatings(ratings)
  }

  // 确认面试结束
  const handleInterviewEndConfirm = async () => {
    setInterviewEndSubmitting(true)
    try {
      const record = records.find(r => r.id === interviewEndDialog.recordId)

      // 1. 保存评分变更
      const changedDimensions = Object.entries(interviewEndRatings)
        .filter(([dim, rating]) => {
          const currentRating = getRating(record?.resume.evaluationDimensions || [], dim)
          return rating !== null && rating !== currentRating
        })
        .map(([dimension, rating]) => ({ dimension, rating: rating! }))

      if (changedDimensions.length > 0) {
        const positionId = record?.resume.position?.id || null
        const evalRes = await fetch('/api/evaluations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resumeId: record?.resume.id, positionId, dimensions: changedDimensions, source: 'manual' }),
        })
        const evalJson = await evalRes.json()
        if (!evalJson.success) throw new Error(evalJson.error || '评分保存失败')
      }

      // 2. 更新跟进状态
      const body: Record<string, unknown> = { status: 'INTERVIEWED' }
      if (interviewEndNote) body.note = interviewEndNote
      if (interviewEndTagIds.length > 0) body.tagIds = interviewEndTagIds

      const res = await fetch(`/api/follow-up/records/${interviewEndDialog.recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('面试结束，已存档')
      setInterviewEndDialog({ open: false, recordId: '', candidateName: '' })
      setInterviewEndNote('')
      setInterviewEndTagIds([])
      setInterviewEndRatings({})
      loadRecords()
      loadCounts()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    } finally {
      setInterviewEndSubmitting(false)
    }
  }

  // 录取
  const handleHire = async () => {
    if (!hireForm.startDate) {
      toast.error('请选择入职时间')
      return
    }
    try {
      const res = await fetch(`/api/follow-up/records/${hireDialog.recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: hireDialog.targetStatus, startDate: hireForm.startDate }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`${hireDialog.title}成功`)
      setHireDialog({ open: false, recordId: '', candidateName: '', targetStatus: 'HIRED', title: '入职', confirmLabel: '确认' })
      setHireForm({ startDate: '' })
      loadRecords()
      loadCounts()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    }
  }

  // 不合适弹窗成功回调
  const handleUnsuitableSuccess = () => {
    loadRecords()
    loadCounts()
  }

  // 离职确认
  const handleResign = async () => {
    // 离职原因必填
    if (!resignForm.resignReason?.trim()) {
      toast.error('请填写原因')
      return
    }
    setResignSubmitting(true)
    try {
      const res = await fetch(`/api/follow-up/records/${resignDialog.recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'RESIGNED',
          resignedAt: resignForm.resignedAt || new Date().toISOString().slice(0, 10),
          resignReason: resignForm.resignReason || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '操作失败')
      toast.success('已标记为已离职')
      setResignDialog({ open: false, recordId: '', candidateName: '' })
      setResignForm({ resignedAt: '', resignReason: '' })
      loadRecords()
      loadCounts()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    } finally {
      setResignSubmitting(false)
    }
  }

  // 取消跟进
  const handleCancelFollowUp = async (recordId: string) => {
    if (!(await confirmDialog({
      title: '确定取消跟进？',
      description: '该候选人将返回已筛选简历列表。',
      confirmText: '取消跟进',
      cancelText: '返回',
    }))) return
    try {
      const res = await fetch(`/api/follow-up/records/${recordId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('已取消跟进')
      loadRecords()
      loadCounts()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    }
  }

  // 备注编辑弹窗
  const handleNoteClick = (recordId: string, candidateName: string, currentNote: string | null) => {
    saveScrollPos()
    setNoteDialog({ open: true, recordId, candidateName })
    setNoteValue(currentNote || '')
  }

  const handleNoteSave = async () => {
    const trimmed = noteValue.trim()
    setNoteSaving(true)
    try {
      const res = await fetch(`/api/follow-up/records/${noteDialog.recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: trimmed || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('备注已更新')
      setNoteDialog({ open: false, recordId: '', candidateName: '' })
      setNoteValue('')
      loadRecords()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '更新失败')
    } finally {
      setNoteSaving(false)
    }
  }

  const handleNoteDialogClose = () => {
    setNoteDialog({ open: false, recordId: '', candidateName: '' })
    setNoteValue('')
  }

  // 原因编辑（拒绝原因 / 离职原因，label 如「离职原因」「取消原因」）
  const handleReasonEditClick = (recordId: string, candidateName: string, currentReason: string | null, field: 'rejectReason' | 'resignReason', label: string) => {
    saveScrollPos()
    setReasonEditDialog({ open: true, recordId, candidateName, field, label })
    setReasonEditValue(currentReason || '')
  }

  const handleReasonEditSave = async () => {
    const trimmed = reasonEditValue.trim()
    setReasonEditSaving(true)
    try {
      const res = await fetch(`/api/follow-up/records/${reasonEditDialog.recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [reasonEditDialog.field]: trimmed || null, reasonLabel: reasonEditDialog.label }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`${reasonEditDialog.label}已更新`)
      setReasonEditDialog({ open: false, recordId: '', candidateName: '', field: 'rejectReason', label: '拒绝原因' })
      setReasonEditValue('')
      loadRecords()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '更新失败')
    } finally {
      setReasonEditSaving(false)
    }
  }

  const handleReasonEditDialogClose = () => {
    setReasonEditDialog({ open: false, recordId: '', candidateName: '', field: 'rejectReason', label: '拒绝原因' })
    setReasonEditValue('')
  }

  // 回退操作
  const handleRollbackClick = (recordId: string, candidateName: string, currentStatus: string) => {
    saveScrollPos()
    setRollbackDialog({ open: true, recordId, candidateName, currentStatus })
    setRollbackTarget('')
    setRollbackReason('')
  }

  const handleRollbackConfirm = async () => {
    if (!rollbackTarget) {
      toast.error('请选择回退目标状态')
      return
    }
    if (!rollbackReason.trim()) {
      toast.error('请填写回退原因')
      return
    }
    setRollbackSaving(true)
    try {
      const res = await fetch(`/api/follow-up/records/${rollbackDialog.recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: rollbackTarget, rollbackReason: rollbackReason.trim(), rejectReason: null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('已回退')
      setRollbackDialog({ open: false, recordId: '', candidateName: '', currentStatus: '' })
      setRollbackTarget('')
      setRollbackReason('')
      loadRecords()
      loadCounts()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    } finally {
      setRollbackSaving(false)
    }
  }

  const handleRollbackDialogClose = () => {
    if (!rollbackSaving) {
      setRollbackDialog({ open: false, recordId: '', candidateName: '', currentStatus: '' })
      setRollbackTarget('')
      setRollbackReason('')
    }
  }

  // 星级评分修改
  const handleRatingChange = useCallback(async (recordId: string, resumeId: string, dimension: string, rating: number) => {
    try {
      // 优先使用跟进关联的岗位 ID，回退到简历主岗位
      const record = records.find(r => r.id === recordId)
      const positionId = record?.resume.evaluationPosition?.id || record?.resume.position?.id || null

      const res = await fetch('/api/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeId, positionId, dimensions: [{ dimension, rating }], source: 'manual' }),
      })
      const json = await res.json()
      if (json.success) {
        setRecords((prev) =>
          prev.map((r) => {
            if (r.id !== recordId) return r
            const newEvals = r.resume.evaluationDimensions.map((e) =>
              e.dimension === dimension ? { ...e, rating } : e
            )
            if (!newEvals.find((e) => e.dimension === dimension)) {
              newEvals.push({ dimension, rating, comment: null, source: 'manual' })
            }
            return {
              ...r,
              resume: {
                ...r.resume,
                initialScore: json.scores.initialScore,
                compositeScore: json.scores.compositeScore,
                evaluationDimensions: newEvals,
              },
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
  }, [records])

  // 打开日志抽屉
  const openLogDrawer = async (record: FollowUpRecordItem) => {
    setLogDrawer({ open: true, recordId: record.id, candidateName: record.resume.candidateName || '未知', logs: [] })
    try {
      const res = await fetch(`/api/follow-up/records/${record.id}`)
      const json = await res.json()
      if (json.record?.logs) {
        setLogDrawer((prev) => ({ ...prev, logs: json.record.logs }))
      }
    } catch {
      // ignore
    }
  }

  // 获取维度评分
  const getRating = (evals: EvaluationDimension[], dim: string) => evals.find((e) => e.dimension === dim)?.rating ?? null

  // 计算显示得分（冰山/初筛自动切换，规则单点在 isIcebergRated）
  const getDisplayScore = (record: FollowUpRecordItem) => {
    const evals = record.resume.evaluationDimensions
    const hasIcebergRating = isIcebergRated(evals)

    // 如果冰山维度有评分，显示综合得分（冰山模型）
    if (hasIcebergRating && record.evaluation?.compositeScore != null) {
      return { label: '冰山', score: record.evaluation.compositeScore }
    }
    // 否则显示初筛得分（初筛模型）
    if (record.evaluation?.initialScore != null) {
      return { label: '初筛', score: record.evaluation.initialScore }
    }
    return null
  }

  // ==================== 渲染 ====================

  const currentTab = FOLLOW_UP_TABS.find((t) => t.key === activeTab) || FOLLOW_UP_TABS[0]

  return (
    <ResumePageShell>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h2 className="shrink-0 whitespace-nowrap text-2xl font-bold">跟进管理</h2>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="whitespace-nowrap">沟通中 <strong className="tabular-nums text-foreground">{counts.CONTACTING || 0}</strong></span>
            <span className="whitespace-nowrap">待面试 <strong className="tabular-nums text-foreground">{counts.INTERVIEW_SCHEDULED || 0}</strong></span>
            <span className="whitespace-nowrap">已面试 <strong className="tabular-nums text-foreground">{counts.INTERVIEWED || 0}</strong></span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportState.setOpen(true)}
            className="h-9 gap-1.5"
          >
            <Download className="h-4 w-4" />
            导出
          </Button>
          <Button onClick={loadRecords} disabled={loading} variant="ghost" size="icon" className="hover:bg-muted hover:text-muted-foreground transition-all duration-200" title="刷新">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="relative">
        <div className="flex gap-1 border-b overflow-x-auto scrollbar-hide">
          {FOLLOW_UP_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => updateParams({ tab: tab.key, page: '' })}
              className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200 ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="pointer-events-none absolute right-0 top-0 bottom-[1px] w-8 bg-gradient-to-l from-background to-transparent" />
      </div>

      {/* Search + Advanced Filter */}
      <FollowUpFilterBar
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        onSearch={() => updateParams({ search: searchInput, page: '' })}
        filterOpen={filterOpen}
        setFilterOpen={setFilterOpen}
        activeFilterCount={activeFilterCount}
        sortOrder={sortOrder}
        onToggleSortOrder={() => updateParams({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc', page: '' })}
        allTags={allTags}
        draftTagIds={draftTagIds}
        setDraftTagIds={setDraftTagIds}
        draftTagLogic={draftTagLogic}
        setDraftTagLogic={setDraftTagLogic}
        allPositions={allPositions}
        draftPositionIds={draftPositionIds}
        setDraftPositionIds={setDraftPositionIds}
        draftDateFrom={draftDateFrom}
        setDraftDateFrom={setDraftDateFrom}
        draftDateTo={draftDateTo}
        setDraftDateTo={setDraftDateTo}
        activeTab={activeTab}
        draftContacted={draftContacted}
        setDraftContacted={setDraftContacted}
        onApplyFilters={applyFilters}
        onClearFilters={clearFilters}
      />

      {/* Table */}
      <FollowUpTable
        activeTab={activeTab}
        currentTabLabel={currentTab.label}
        currentTabFrom={currentTab.from}
        loading={loading}
        records={records}
        getDisplayScore={getDisplayScore}
        getRating={getRating}
        formatInterviewTime={formatInterviewTime}
        onRatingChange={handleRatingChange}
        onOpenLog={openLogDrawer}
        writeNavSnapshot={writeNavSnapshot}
        currentQueryString={currentQueryString}
        allTags={allTags}
        setAllTags={setAllTags}
        saveScrollPos={saveScrollPos}
        reload={loadRecords}
        onNoteClick={handleNoteClick}
        onReasonEditClick={handleReasonEditClick}
        onContactedChange={async (record, newValue) => {
          saveScrollPos()
          const res = await fetch(`/api/follow-up/records/${record.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contacted: newValue }),
          })
          if (res.ok) {
            toast.success(`联系结果已更新为「${contactResultLabel(newValue)}」`)
            await loadRecords()
          } else {
            const json = await res.json()
            toast.error(json.error || '更新失败')
          }
        }}
        onForwardAction={(record, action) => {
          saveScrollPos()
          const name = record.resume.candidateName || '未知'
          switch (action.kind) {
            case 'schedule':
              setScheduleDialog({ open: true, recordId: record.id, candidateName: name })
              break
            case 'interviewEnd':
              handleInterviewEnd(record.id)
              break
            case 'hire':
              // 预填已有入职时间（发offer/接受offer/入职 各环节自动复写）
              setHireDialog({ open: true, recordId: record.id, candidateName: name, targetStatus: action.target, title: action.hireTitle || '入职', confirmLabel: action.hireConfirmLabel || '确认' })
              setHireForm({ startDate: record.startDate || '' })
              break
            case 'unsuitable':
              setUnsuitableDialog({ open: true, recordId: record.id, resumeId: record.resume.id, candidateName: name, title: action.unsuitableTitle || '不合适', targetStatus: action.target })
              break
            case 'resign':
              setResignDialog({ open: true, recordId: record.id, candidateName: name })
              break
          }
        }}
        onRollback={(record) => handleRollbackClick(record.id, record.resume.candidateName || '未知', activeTab)}
        onCancelFollowUp={(record) => { saveScrollPos(); handleCancelFollowUp(record.id) }}
        pagination={pagination}
        pageSize={pageSize}
        setPage={setPage}
        updateParams={updateParams}
      />

      {/* ==================== 弹窗 ==================== */}

      {/* 预约面试弹窗 */}
      <ScheduleDialog
        open={scheduleDialog.open}
        candidateName={scheduleDialog.candidateName}
        time={scheduleTime}
        onTimeChange={setScheduleTime}
        onCancel={() => { setScheduleDialog({ open: false, recordId: '', candidateName: '' }); setScheduleTime('') }}
        onConfirm={handleScheduleInterview}
      />

      {/* 不合适弹窗（替代旧的拒绝/不合适内联弹窗） */}
      <UnsuitableDialog
        open={unsuitableDialog.open}
        onClose={() => setUnsuitableDialog({ open: false, recordId: '', resumeId: '', candidateName: '', title: '', targetStatus: 'UNSUITABLE' })}
        resumeId={unsuitableDialog.resumeId}
        candidateName={unsuitableDialog.candidateName}
        recordId={unsuitableDialog.recordId}
        title={unsuitableDialog.title}
        targetStatus={unsuitableDialog.targetStatus}
        onSuccess={handleUnsuitableSuccess}
      />

      {/* 录取弹窗 */}
      <HireDialog
        open={hireDialog.open}
        title={hireDialog.title}
        candidateName={hireDialog.candidateName}
        startDate={hireForm.startDate}
        onStartDateChange={(v) => setHireForm((prev) => ({ ...prev, startDate: v }))}
        confirmLabel={hireDialog.confirmLabel}
        onCancel={() => { setHireDialog({ open: false, recordId: '', candidateName: '', targetStatus: 'HIRED', title: '入职', confirmLabel: '确认' }); setHireForm({ startDate: '' }) }}
        onConfirm={handleHire}
      />

      {/* 离职弹窗 */}
      <ResignDialog
        open={resignDialog.open}
        candidateName={resignDialog.candidateName}
        resignedAt={resignForm.resignedAt}
        resignReason={resignForm.resignReason}
        submitting={resignSubmitting}
        onFieldChange={(patch) => setResignForm((prev) => ({ ...prev, ...patch }))}
        onCancel={() => {
          setResignDialog({ open: false, recordId: '', candidateName: '' })
          setResignForm({ resignedAt: '', resignReason: '' })
        }}
        onConfirm={handleResign}
      />

      {/* 日志抽屉 */}
      <FollowUpLogDrawer
        open={logDrawer.open}
        candidateName={logDrawer.candidateName}
        logs={logDrawer.logs}
        onClose={() => setLogDrawer({ open: false, recordId: '', candidateName: '', logs: [] })}
      />

      {/* 导出弹窗 */}
      <ExportDialog
        open={exportState.open}
        onOpenChange={exportState.setOpen}
        selected={exportState.fields}
        onToggle={exportState.toggleField}
        loading={exportState.loading}
        onExport={exportState.submit}
      />

      {/* 备注编辑弹窗 */}
      <NoteDialog
        open={noteDialog.open}
        candidateName={noteDialog.candidateName}
        value={noteValue}
        onChange={setNoteValue}
        saving={noteSaving}
        onClose={handleNoteDialogClose}
        onSave={handleNoteSave}
      />

      {/* 原因编辑弹窗（不合适拒绝原因 / 拒offer / 取消面试 / 离职原因） */}
      <ReasonEditDialog
        open={reasonEditDialog.open}
        label={reasonEditDialog.label}
        candidateName={reasonEditDialog.candidateName}
        field={reasonEditDialog.field}
        value={reasonEditValue}
        onChange={setReasonEditValue}
        saving={reasonEditSaving}
        onClose={handleReasonEditDialogClose}
        onSave={handleReasonEditSave}
      />

      {/* 回退弹窗 */}
      <RollbackDialog
        open={rollbackDialog.open}
        candidateName={rollbackDialog.candidateName}
        currentStatus={rollbackDialog.currentStatus}
        target={rollbackTarget}
        onTargetChange={setRollbackTarget}
        reason={rollbackReason}
        onReasonChange={setRollbackReason}
        saving={rollbackSaving}
        onClose={handleRollbackDialogClose}
        onConfirm={handleRollbackConfirm}
      />

      {/* 面试结束确认弹窗 */}
      <InterviewEndDialog
        open={interviewEndDialog.open}
        candidateName={interviewEndDialog.candidateName}
        ratings={interviewEndRatings}
        onRatingChange={(dim, r) => setInterviewEndRatings(prev => ({ ...prev, [dim]: r }))}
        tagIds={interviewEndTagIds}
        allTags={allTags}
        onToggleTag={(tagId) => setInterviewEndTagIds(prev => prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId])}
        note={interviewEndNote}
        onNoteChange={setInterviewEndNote}
        submitting={interviewEndSubmitting}
        onClose={() =>
          // 只关不清理：保留数据让 ui/Dialog 播完退场动画；下次 open 时 handleInterviewEnd 会重置
          setInterviewEndDialog((prev) => ({ ...prev, open: false }))
        }
        onConfirm={handleInterviewEndConfirm}
      />
    </ResumePageShell>
  )
}

export default function FollowUpPage() {
  return (
    <Suspense>
      <FollowUpPageInner />
    </Suspense>
  )
}
