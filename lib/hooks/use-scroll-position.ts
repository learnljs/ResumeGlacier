'use client'

import { useCallback, useRef } from 'react'

interface UseScrollPositionOptions {
  /** 存储键（通常为当前完整 URL：pathname + search） */
  storageKey: string
  /** 当前页码（用于判断"最后一条且非首页"场景） */
  page: number
  /** 回到上一页的回调（当最后一条且非首页时触发） */
  onBackToPrevPage: () => void
}

interface UseScrollPositionReturn {
  /** 保存当前滚动位置到 sessionStorage */
  save: () => void
  /**
   * 尝试恢复滚动位置
   * @param itemCount 当前页数据条数（用于判断"最后一条"场景）
   */
  restore: (itemCount: number) => void
  /** 清除当前键对应的存储 */
  clear: () => void
}

/**
 * 管理列表页面的滚动位置记忆（基于 sessionStorage）
 *
 * 使用场景：用户滚动列表 → 离开页面（查看详情/执行操作）→ 返回或刷新后 → 恢复滚动位置
 *
 * 特殊处理：当前页数据为空且非首页时，操作后回到上一页顶部而非恢复
 */
export function useScrollPosition({
  storageKey,
  page,
  onBackToPrevPage,
}: UseScrollPositionOptions): UseScrollPositionReturn {
  const savingRef = useRef(false)

  const save = useCallback(() => {
    if (savingRef.current) return
    savingRef.current = true
    try {
      const y = window.scrollY
      if (y > 0) {
        sessionStorage.setItem(storageKey, String(y))
      }
    } catch {
      /* ignore */
    } finally {
      savingRef.current = false
    }
  }, [storageKey])

  const restore = useCallback(
    (itemCount: number) => {
      // 特殊处理：当前页数据为空且不是首页 → 回到上一页顶部
      if (itemCount === 0 && page > 1) {
        try {
          sessionStorage.removeItem(storageKey)
        } catch {
          /* ignore */
        }
        onBackToPrevPage()
        return
      }

      try {
        const saved = sessionStorage.getItem(storageKey)
        if (!saved) return

        const targetY = parseInt(saved, 10)
        if (!Number.isFinite(targetY) || targetY <= 0) {
          sessionStorage.removeItem(storageKey)
          return
        }

        // 双重延迟确保 React DOM 提交完成后再滚动
        requestAnimationFrame(() => {
          setTimeout(() => {
            window.scrollTo({ top: targetY, behavior: 'instant' as ScrollBehavior })
          }, 0)
        })

        // 恢复后清除，避免下次加载误恢复
        sessionStorage.removeItem(storageKey)
      } catch {
        /* ignore */
      }
    },
    [storageKey, page, onBackToPrevPage]
  )

  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey)
    } catch {
      /* ignore */
    }
  }, [storageKey])

  return { save, restore, clear }
}
