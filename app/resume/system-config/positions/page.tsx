'use client'

import { PageSkeleton } from '@/components/ui/page-skeleton'
import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Briefcase, Ban, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { ResumePageShell } from '@/components/resume/PageShell'
import { apiErrorMessage } from '@/lib/utils/api-message'

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

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)

  const loadPositions = async () => {
    try {
      const res = await fetch('/api/positions')
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setPositions(json.positions)
    } catch (err: unknown) {
      const msg = apiErrorMessage(err, '加载失败，请稍后重试')
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPositions()
  }, [])

  if (loading) {
    return <PageSkeleton variant="table" className="p-0" />
  }

  return (
    <ResumePageShell>
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">职位管理</h2>
        <div className="flex gap-2">
          <Link href="/resume/system-config/positions/disabled">
            <Button variant="outline" className="gap-2">
              <Ban className="h-4 w-4" />
              已停用职位
            </Button>
          </Link>
          <Link href="/resume/system-config/positions/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              新增职位
            </Button>
          </Link>
        </div>
      </div>

      {/* Active positions list */}
      {positions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Briefcase className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground">暂无启用中的职位，点击上方按钮创建</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {positions.map((pos) => (
            <Link key={pos.id} href={`/resume/system-config/positions/${pos.id}`}>
              <Card className="hover:shadow-card transition-shadow cursor-pointer group">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold group-hover:text-primary transition-colors">
                          {pos.title}
                        </h3>
                        {pos.department && (
                          <Badge variant="secondary">{pos.department}</Badge>
                        )}
                        <Badge variant="outline">{pos._count.resumes} 份简历</Badge>
                      </div>
                      {pos.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {pos.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium">筛选要求：</span>
                        {pos.requirements.substring(0, 100)}
                        {pos.requirements.length > 100 && '...'}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0 ml-4 mt-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
    </ResumePageShell>
  )
}
