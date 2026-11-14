'use client'

import { useState } from 'react'
import { toast } from 'sonner'

/** 导出请求所需的当前筛选条件（不含分页，导出全量） */
export interface FollowUpExportFilters {
  tagIds: string[]
  tagLogic: 'OR' | 'AND'
  search: string
  positionIds: string[]
  recordStatus: string
  dateFrom: string
  dateTo: string
  contacted: string[]
}

const DEFAULT_FIELDS = ['candidateName', 'candidatePhone', 'position', 'initialScore']

/**
 * 跟进数据导出（B9 从页面提取）。
 *
 * 页面只保留「弹窗开合」这一项状态，字段选择、请求与下载都在此处完成；
 * 筛选条件由调用方每次渲染传入，导出时读取当次闭包里的最新值。
 */
export function useFollowUpExport(filters: FollowUpExportFilters) {
  const [open, setOpen] = useState(false)
  const [fields, setFields] = useState<string[]>(DEFAULT_FIELDS)
  const [loading, setLoading] = useState(false)

  const toggleField = (key: string) => {
    setFields((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const submit = async () => {
    if (fields.length === 0) {
      toast.error('请至少选择一个导出字段')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/follow-up/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields,
          tagIds: filters.tagIds,
          tagLogic: filters.tagLogic,
          search: filters.search,
          positionIds: filters.positionIds,
          recordStatus: filters.recordStatus,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          contacted: filters.contacted,
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || '导出失败')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `跟进数据导出-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('导出成功')
      setOpen(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '导出失败')
    } finally {
      setLoading(false)
    }
  }

  return { open, setOpen, fields, toggleField, loading, submit }
}
