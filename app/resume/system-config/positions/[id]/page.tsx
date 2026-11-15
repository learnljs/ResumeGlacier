'use client'

import { PageSkeleton } from '@/components/ui/page-skeleton'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { PositionEditor } from '@/components/resume/PositionEditor'
import { toast } from 'sonner'
import { apiErrorMessage } from '@/lib/utils/api-message'

interface PositionData {
  id: string
  title: string
  department: string | null
  description: string
  requirements: string
  keywords: string | null
  status: string
  defaultInitialModelId: string | null
  defaultIcebergModelId: string | null
  weightModels: Array<{
    id: string
    name: string
    category: string
    weights: string
  }>
  _count: { resumes: number }
}

/**
 * 编辑已有职位页面
 * 全屏独立页面，加载职位数据后使用 PositionEditor 组件
 */
export default function EditPositionPage() {
  const params = useParams()
  const id = params.id as string
  const [position, setPosition] = useState<PositionData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    fetch(`/api/positions/${id}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) throw new Error(json.error)
        setPosition(json.position)
      })
      .catch((err: unknown) => {
        const msg = apiErrorMessage(err, '加载职位失败，请稍后重试')
        toast.error(msg)
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return <PageSkeleton variant="form" />
  }

  if (!position) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-muted-foreground">职位不存在</p>
      </div>
    )
  }

  return <PositionEditor position={position} />
}
