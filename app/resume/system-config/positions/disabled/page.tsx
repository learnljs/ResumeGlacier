'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Ban, Play, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Position {
  id: string
  title: string
  department: string | null
  description: string
  requirements: string
  keywords: string | null
  status: string
  _count: { resumes: number }
}

/**
 * 已停用职位子页面
 * 展示所有已停用职位，提供启用和删除按钮
 */
export default function DisabledPositionsPage() {
  const router = useRouter()
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [enablingId, setEnablingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadPositions = async () => {
    try {
      const res = await fetch('/api/positions?status=disabled')
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setPositions(json.positions)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载失败'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPositions()
  }, [])

  const handleEnable = async (position: Position) => {
    setEnablingId(position.id)
    try {
      const res = await fetch(`/api/positions/${position.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success(`「${position.title}」已启用`)
      router.refresh()
      loadPositions()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '启用失败'
      toast.error(msg)
    } finally {
      setEnablingId(null)
    }
  }

  const handleDelete = async (position: Position) => {
    if (!(await confirmDialog({
      title: `永久删除职位「${position.title}」？`,
      description: '此操作不可撤销。',
      confirmText: '永久删除',
      destructive: true,
    }))) return
    setDeletingId(position.id)
    try {
      const res = await fetch(`/api/positions/${position.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success(`「${position.title}」已删除`)
      router.refresh()
      loadPositions()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '删除失败'
      toast.error(msg)
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/resume/system-config/positions">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h2 className="text-2xl font-bold">已停用职位</h2>
      </div>

      {positions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Ban className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground">暂无已停用的职位</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {positions.map((pos) => (
            <Card key={pos.id} className="opacity-60 hover:opacity-80 transition-opacity">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{pos.title}</h3>
                      {pos.department && (
                        <Badge variant="secondary">{pos.department}</Badge>
                      )}
                      <Badge variant="outline">{pos._count.resumes} 份简历</Badge>
                      <Badge variant="secondary">已停用</Badge>
                    </div>
                    {pos.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {pos.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4 shrink-0">
                    {pos._count.resumes === 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(pos)}
                        disabled={deletingId === pos.id}
                        className="gap-2 text-destructive hover:text-destructive border-red-200 hover:bg-red-50"
                      >
                        {deletingId === pos.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        删除
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEnable(pos)}
                      disabled={enablingId === pos.id}
                      className="gap-2"
                    >
                      {enablingId === pos.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      启用
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
