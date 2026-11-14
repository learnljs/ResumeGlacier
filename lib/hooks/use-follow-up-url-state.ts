'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * 跟进页的查询状态（B9 从页面提取）。
 *
 * URL 是筛选/排序/分页的唯一数据源；本地另存一份「草稿」，供高级筛选抽屉
 * 编辑后再一次性写回 URL。本 hook 只负责解析、写回与草稿管理，
 * 不碰数据请求（列表加载见 useFollowUpExport 之外的 loadRecords）。
 */
export function useFollowUpUrlState() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const activeTab = searchParams.get('tab') || 'CONTACTING'
  const search = searchParams.get('search') || ''
  const page = Number(searchParams.get('page')) || 1
  const pageSize = Number(searchParams.get('pageSize')) || 20
  // 排序方向：asc | desc，默认 desc
  const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'

  // 当前完整查询字符串，用于详情页返回时恢复筛选/排序状态
  const currentQueryString = searchParams.toString()

  // 从 URL 读取筛选条件（useMemo 稳定引用，避免 effect 反复触发）
  const selectedTagIds = useMemo(
    () => (searchParams.get('tagIds') || '').split(',').filter(Boolean),
    [searchParams]
  )
  const tagLogic = (searchParams.get('tagLogic') || 'OR') as 'OR' | 'AND'
  const filterPositionIds = useMemo(
    () => (searchParams.get('positionIds') || '').split(',').filter(Boolean),
    [searchParams]
  )
  const filterDateFrom = searchParams.get('dateFrom') || ''
  const filterDateTo = searchParams.get('dateTo') || ''
  const filterContacted = useMemo(
    () => (searchParams.get('contacted') || '').split(',').filter(Boolean),
    [searchParams]
  )

  // 本地草稿：仅在页面首次加载时从 URL 取初值，抽屉内编辑不立刻改 URL
  const [draftTagIds, setDraftTagIds] = useState<string[]>(() =>
    (searchParams.get('tagIds') || '').split(',').filter(Boolean)
  )
  const [draftTagLogic, setDraftTagLogic] = useState<'OR' | 'AND'>(
    () => (searchParams.get('tagLogic') || 'OR') as 'OR' | 'AND'
  )
  const [draftPositionIds, setDraftPositionIds] = useState<string[]>(() =>
    (searchParams.get('positionIds') || '').split(',').filter(Boolean)
  )
  const [draftDateFrom, setDraftDateFrom] = useState(() => searchParams.get('dateFrom') || '')
  const [draftDateTo, setDraftDateTo] = useState(() => searchParams.get('dateTo') || '')
  const [draftContacted, setDraftContacted] = useState<string[]>(() =>
    (searchParams.get('contacted') || '').split(',').filter(Boolean)
  )

  // 已生效筛选条件的数量（基于 URL，不含草稿）
  const activeFilterCount = [
    selectedTagIds.length > 0,
    filterPositionIds.length > 0,
    !!filterDateFrom || !!filterDateTo,
    filterContacted.length > 0,
  ].filter(Boolean).length

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value)
        } else {
          params.delete(key)
        }
      }
      router.replace(`/resume/follow-up?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  // 应用筛选：把草稿一次性写入 URL
  const applyFilters = useCallback(() => {
    updateParams({
      tagIds: draftTagIds.join(','),
      tagLogic: draftTagLogic === 'AND' ? 'AND' : '',
      positionIds: draftPositionIds.join(','),
      dateFrom: draftDateFrom,
      dateTo: draftDateTo,
      contacted: draftContacted.join(','),
      page: '',
    })
  }, [updateParams, draftTagIds, draftTagLogic, draftPositionIds, draftDateFrom, draftDateTo, draftContacted])

  // 清除筛选：同时清空草稿与 URL
  const clearFilters = useCallback(() => {
    setDraftTagIds([])
    setDraftTagLogic('OR')
    setDraftPositionIds([])
    setDraftDateFrom('')
    setDraftDateTo('')
    setDraftContacted([])
    updateParams({ tagIds: '', tagLogic: '', positionIds: '', dateFrom: '', dateTo: '', contacted: '', page: '' })
  }, [updateParams])

  const setPage = useCallback((v: number) => updateParams({ page: v > 1 ? String(v) : '' }), [updateParams])

  // 列表接口参数（筛选 + 排序，不含分页），供加载与详情页导航快照共用
  const buildApiParams = useCallback(() => {
    const params = new URLSearchParams()
    params.set('recordStatus', activeTab)
    if (search) params.set('search', search)
    if (selectedTagIds.length > 0) params.set('tagIds', selectedTagIds.join(','))
    if (tagLogic !== 'OR') params.set('tagLogic', tagLogic)
    if (filterPositionIds.length > 0) params.set('positionIds', filterPositionIds.join(','))
    if (filterDateFrom) params.set('dateFrom', filterDateFrom)
    if (filterDateTo) params.set('dateTo', filterDateTo)
    if (filterContacted.length > 0) params.set('contacted', filterContacted.join(','))
    params.set('sortOrder', sortOrder)
    return params
  }, [activeTab, search, selectedTagIds, tagLogic, filterPositionIds, filterDateFrom, filterDateTo, filterContacted, sortOrder])

  return {
    activeTab,
    search,
    page,
    pageSize,
    sortOrder,
    currentQueryString,
    selectedTagIds,
    tagLogic,
    filterPositionIds,
    filterDateFrom,
    filterDateTo,
    filterContacted,
    activeFilterCount,
    draftTagIds,
    setDraftTagIds,
    draftTagLogic,
    setDraftTagLogic,
    draftPositionIds,
    setDraftPositionIds,
    draftDateFrom,
    setDraftDateFrom,
    draftDateTo,
    setDraftDateTo,
    draftContacted,
    setDraftContacted,
    updateParams,
    applyFilters,
    clearFilters,
    setPage,
    buildApiParams,
  }
}
