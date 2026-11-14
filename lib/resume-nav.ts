// 简历详情页连续浏览的导航快照工具。
// 列表页跳转详情前，把当前列表的简历顺序（及分页信息）存入 sessionStorage；
// 详情页据此提供「上一份/下一份」连续浏览，翻到快照末尾时按相同筛选条件自动追加拉取下一页。
// 全量列表（如 reevaluate、emails 页）一次存入全部 id，不涉及追加。

export type NavIdSource = 'resumes' | 'follow-up'

export interface ResumeNavSnapshot {
  /** 按列表展示顺序排列的简历 id */
  ids: string[]
  /** 已包含的最后一页页码；全量来源为 0 */
  page: number
  pageSize: number
  /** 服务端总页数；全量来源为 0（表示无更多可追加） */
  totalPages: number
  /** 不含 page/pageSize 的列表 API 地址（含 query），用于边界追加 */
  apiUrl?: string
  /** 追加响应中简历 id 的提取路径 */
  idSource?: NavIdSource
}

const STORAGE_KEY = 'resume-nav-snapshot'

export function saveResumeNavSnapshot(snapshot: ResumeNavSnapshot): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // 存储不可用时静默降级为无导航
  }
}

export function getResumeNavSnapshot(): ResumeNavSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ResumeNavSnapshot
    if (!Array.isArray(parsed?.ids)) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * 边界追加：按快照记录的筛选条件拉取下一页，返回追加了新 id 的快照。
 * 已无更多页时原样返回；请求失败抛出，由调用方提示并允许重试。
 */
export async function appendNextResumePage(snapshot: ResumeNavSnapshot): Promise<ResumeNavSnapshot> {
  if (!snapshot.apiUrl || !snapshot.idSource || snapshot.page >= snapshot.totalPages) return snapshot

  const separator = snapshot.apiUrl.includes('?') ? '&' : '?'
  const res = await fetch(
    `${snapshot.apiUrl}${separator}page=${snapshot.page + 1}&pageSize=${snapshot.pageSize}`
  )
  const json = await res.json()
  if (json.error) throw new Error(json.error)

  const items: Array<Record<string, unknown>> =
    snapshot.idSource === 'follow-up' ? (json.records ?? []) : (json.resumes ?? [])
  const existing = new Set(snapshot.ids)
  const fresh: string[] = []
  for (const item of items) {
    const resume = item.resume as { id?: string } | undefined
    const id = (snapshot.idSource === 'follow-up' ? resume?.id : item.id) as string | undefined
    if (id && !existing.has(id)) {
      existing.add(id)
      fresh.push(id)
    }
  }

  return { ...snapshot, ids: [...snapshot.ids, ...fresh], page: snapshot.page + 1 }
}
