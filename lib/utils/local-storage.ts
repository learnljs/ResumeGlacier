/**
 * localStorage 版本化读写单点（B9）。
 *
 * 背景：reevaluate 页自建 storageSet / storageGet / storageRemove（写入时带版本号，
 * 读取时版本不匹配则自动清理，避免旧结构脏读），属通用能力。
 * 本文件为唯一实现，页面只需提供自己的 key 与版本号。
 */

/** 默认数据版本号 */
export const DEFAULT_STORAGE_VERSION = 1

/** 带版本号写入；写入失败（配额超限 / 隐私模式）静默忽略 */
export function storageSet<T>(key: string, data: T, version: number = DEFAULT_STORAGE_VERSION): void {
  try {
    localStorage.setItem(key, JSON.stringify({ v: version, d: data }))
  } catch {
    /* quota exceeded / private mode */
  }
}

/** 读取；版本不匹配或解析失败时清理该 key 并返回 null */
export function storageGet<T>(key: string, version: number = DEFAULT_STORAGE_VERSION): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.v === version) return parsed.d as T
    // 版本不匹配 → 清理
    localStorage.removeItem(key)
    return null
  } catch {
    localStorage.removeItem(key)
    return null
  }
}

/** 删除 key，失败静默忽略 */
export function storageRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}
