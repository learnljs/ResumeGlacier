/**
 * 客户端 API 请求单点（B10）。
 *
 * 背景：此前 30+ 处组件各自手写 `fetch` + `res.json()`，错误判定混用两种写法
 * （`!res.ok` 与 `json.error`），失败文案与兜底行为不一致。本模块把
 * 「JSON 序列化 / 反序列化 / 非 2xx 抛错」收敛到一处，调用方只需关心数据。
 *
 * 约定（与服务端一致）：错误响应一律为非 2xx + `{ error: string }`。
 *
 * 用法：
 * ```ts
 * const json = await apiFetch<{ resume: Resume }>(`/api/resumes/${id}`)
 * const json = await apiPost(`/api/follow-up/records/${id}`, { note }, { fallbackMessage: '保存失败' })
 * ```
 * 失败时抛出 `ApiError`（含 status 与可读 message），由调用方的 catch 处理。
 */

/** API 请求失败时抛出的错误，携带 HTTP 状态码 */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body' | 'method'> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** 请求体，自动 JSON.stringify；不传则不携带 body */
  body?: unknown
  /** 服务端未提供可读文案时的兜底提示（默认「请求失败」） */
  fallbackMessage?: string
}

/** 从错误响应体中提取可读文案（error 优先，其次 message） */
function extractErrorMessage(data: unknown): string | null {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    if (typeof record.error === 'string' && record.error) return record.error
    if (typeof record.message === 'string' && record.message) return record.message
  }
  return null
}

/**
 * 发起请求并返回解析后的 JSON。
 * @throws {ApiError} 响应非 2xx 时抛出，message 取响应体的 error/message 字段
 */
export async function apiFetch<T = unknown>(
  url: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { body, fallbackMessage = '请求失败', headers, method = 'GET', ...rest } = options

  const init: RequestInit = { ...rest, method }
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json', ...(headers as Record<string, string>) }
    init.body = JSON.stringify(body)
  } else if (headers) {
    init.headers = headers
  }

  const res = await fetch(url, init)

  // 兼容 204 / 空响应体：非 JSON 时原样返回文本，JSON 时解析为对象
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!res.ok) {
    throw new ApiError(extractErrorMessage(data) ?? fallbackMessage, res.status)
  }

  return data as T
}

/** GET 请求 */
export function apiGet<T = unknown>(url: string, options?: ApiFetchOptions): Promise<T> {
  return apiFetch<T>(url, { ...options, method: 'GET' })
}

/** POST 请求（可带 JSON body） */
export function apiPost<T = unknown>(
  url: string,
  body?: unknown,
  options?: ApiFetchOptions
): Promise<T> {
  return apiFetch<T>(url, { ...options, method: 'POST', body })
}

/** PUT 请求（可带 JSON body） */
export function apiPut<T = unknown>(
  url: string,
  body?: unknown,
  options?: ApiFetchOptions
): Promise<T> {
  return apiFetch<T>(url, { ...options, method: 'PUT', body })
}

/** PATCH 请求（可带 JSON body） */
export function apiPatch<T = unknown>(
  url: string,
  body?: unknown,
  options?: ApiFetchOptions
): Promise<T> {
  return apiFetch<T>(url, { ...options, method: 'PATCH', body })
}

/** DELETE 请求 */
export function apiDelete<T = unknown>(url: string, options?: ApiFetchOptions): Promise<T> {
  return apiFetch<T>(url, { ...options, method: 'DELETE' })
}
