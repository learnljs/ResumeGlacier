'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export interface ConfirmOptions {
  /** 标题：一句话说清要做什么 */
  title: string
  /** 补充说明：影响范围 / 不可撤销提示等，支持 `\n` 换行 */
  description?: string
  /** 确认按钮文案，默认「确定」 */
  confirmText?: string
  /** 取消按钮文案，默认「取消」 */
  cancelText?: string
  /** 危险操作（删除 / 停用 / 重置等）→ 确认按钮用 destructive 样式 */
  destructive?: boolean
}

type ConfirmHandler = (options: ConfirmOptions) => Promise<boolean>

/**
 * 模块级宿主引用。ConfirmDialogHost 挂载时注入真实实现，
 * 未挂载时 confirmDialog 退化为原生 window.confirm（不会静默丢确认）。
 */
let host: ConfirmHandler | null = null

/**
 * 命令式确认弹窗 —— 替代 `window.confirm`。
 *
 * ```ts
 * if (!(await confirmDialog({ title: '删除该模型？', destructive: true }))) return
 * ```
 *
 * 需要在应用内挂载一次 `<ConfirmDialogHost />`（见 app/resume/layout.tsx）。
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (host) return host(options)
  if (typeof window === 'undefined') return Promise.resolve(false)
  const fallback = [options.title, options.description].filter(Boolean).join('\n\n')
  return Promise.resolve(window.confirm(fallback))
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

/**
 * 确认弹窗宿主：放在应用布局内，全局只挂一次。
 * 与 `ui/toaster` 的 Toaster 同属「全局单例 UI 出口」。
 */
export function ConfirmDialogHost() {
  const [pending, setPending] = React.useState<PendingConfirm | null>(null)

  React.useEffect(() => {
    host = (options) => new Promise<boolean>((resolve) => setPending({ ...options, resolve }))
    return () => {
      host = null
    }
  }, [])

  const settle = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }

  return (
    <Dialog
      open={pending != null}
      onOpenChange={(open) => {
        // 点击遮罩 / Esc / 右上角关闭 一律视为取消
        if (!open) settle(false)
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{pending?.title}</DialogTitle>
          {/* 始终渲染 Description 以满足 Radix 无障碍要求；无文案时隐藏 */}
          <DialogDescription
            className={cn('whitespace-pre-line', !pending?.description && 'hidden')}
          >
            {pending?.description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => settle(false)}>
            {pending?.cancelText ?? '取消'}
          </Button>
          <Button
            variant={pending?.destructive ? 'destructive' : 'default'}
            onClick={() => settle(true)}
          >
            {pending?.confirmText ?? '确定'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
