'use client'

import { useEffect, useState } from 'react'

/**
 * 响应式媒体查询 hook
 * - SSR 阶段默认返回 true（假设桌面端，Tooltip 比 Popover 更轻量）
 * - hydration 后在客户端匹配实际设备
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(true)

  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}
