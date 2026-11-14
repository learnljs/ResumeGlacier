'use client'

import { useEffect, useState } from 'react'
import { FlaskConical, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { confirmDialog } from '@/components/ui/confirm-dialog'

interface DemoStatus {
  demo: boolean
  counts: { resumes: number; positions: number; followUps: number }
}

/**
 * 演示数据横幅
 *
 * 系统第一次启动、库为空时会自动写入一份演示数据，让首屏不是空状态。
 * 这个横幅负责两件事：
 *   1. 明确告诉用户「现在看到的是假数据」，避免误以为是真实业务数据；
 *   2. 提供唯一的退出入口——一键清空演示数据，回到「配置自己的邮箱」状态。
 */
export function DemoModeBanner() {
  const [status, setStatus] = useState<DemoStatus | null>(null)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/system/demo-mode')
      .then((r) => r.json())
      .then((json: DemoStatus) => {
        if (alive) setStatus(json)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  if (!status?.demo) return null

  const handleReset = async () => {
    const ok = await confirmDialog({
      title: '删除演示数据？',
      description:
        `将清空 ${status.counts.resumes} 份演示简历、${status.counts.positions} 个演示职位及对应的评估与跟进记录。\n` +
        '此操作不可撤销，但不会影响你的 AI 配置。删除后即可接入自己的邮箱。',
      confirmText: '删除并退出演示',
      destructive: true,
    })
    if (!ok) return

    setResetting(true)
    try {
      const res = await fetch('/api/system/demo-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '删除失败')
      toast.success('演示数据已清空，去「系统配置 · 邮箱」接入自己的邮箱')
      setStatus(null)
      // 各页面数据都变了，整页刷新最省事也最不容易留下脏状态
      window.location.href = '/resume/system-config/email'
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '删除失败')
      setResetting(false)
    }
  }

  return (
    <div className="px-6 pt-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-accent/30 bg-accent/[0.06] px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
          <FlaskConical className="h-3.5 w-3.5" />
          演示数据
        </span>
        <span className="text-xs text-muted-foreground">
          当前 {status.counts.resumes} 份简历、{status.counts.positions} 个职位均为虚构，用于展示效果；接入自己的邮箱前可先删除。
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={resetting}
          className="ml-auto h-7 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
        >
          {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          删除演示数据
        </Button>
      </div>
    </div>
  )
}
