'use client'

import { TooltipProvider } from '@/components/ui/tooltip'

/**
 * 客户端 Provider 包装 — 供服务端根布局使用
 * 全局挂载 TooltipProvider，即时显示无延迟
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={0}>
      {children}
    </TooltipProvider>
  )
}
