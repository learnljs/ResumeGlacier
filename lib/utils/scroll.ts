/**
 * 页面滚动位置记忆单点（B9）。
 *
 * 背景：reevaluate 页在跳转详情前保存滚动位置、列表加载完成后恢复，
 * 属可复用能力。key 由调用方传入，行为与迁移前一致。
 */

/** 页面卸载 / 隐藏前保存滚动位置 */
export function saveScrollPosition(key: string): void {
  try {
    localStorage.setItem(key, String(window.scrollY))
  } catch {
    /* ignore */
  }
}

/** 恢复滚动位置（不清除存储值，允许异步加载后重试；成功滚动后清除） */
export function restoreScrollPosition(key: string): void {
  try {
    const saved = localStorage.getItem(key)
    if (!saved) return
    const targetY = parseInt(saved, 10)
    if (Number.isFinite(targetY) && targetY > 0) {
      // 等 DOM 渲染完成后再滚动
      requestAnimationFrame(() => {
        window.scrollTo({ top: targetY, behavior: 'smooth' })
        // 滚动成功后才清除
        localStorage.removeItem(key)
      })
    } else {
      localStorage.removeItem(key)
    }
  } catch {
    /* ignore */
  }
}
