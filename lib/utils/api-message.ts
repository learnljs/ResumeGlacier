/**
 * 前端统一的 API 失败提示文案（纯函数，可单测）
 *
 * 背景：各页面在 catch 里直接 `toast.error(err.message)`，后端返回的原始文本
 * （Prisma / SQLite 报错、连接串、SDK 内部异常、堆栈片段）会被原样弹给 HR，
 * 文案也各不相同。这里统一收口：
 * - 后端主动给的可读业务错误（例如「职位不存在」「端口需为 1–65535」）照常展示
 * - 命中技术性错误特征的一律换成正式兜底文案，不向界面泄漏内部实现
 * - 去掉 Error: 等前缀、限制长度，避免整段响应糊在提示条上
 *
 * 用法：
 * ```ts
 * } catch (err: unknown) {
 *   toast.error(apiErrorMessage(err, '加载失败，请稍后重试'))
 * }
 * ```
 */

export const DEFAULT_API_ERROR = '操作未完成，请稍后重试；若持续出现请联系管理员'

/** 命中即认为不适合展示给 HR 的内部实现细节 */
const TECHNICAL_PATTERN =
  /prisma|sqlite|\bSQL\b|ECONNREFUSED|ECONNRESET|ENOTFOUND|ENOENT|EACCES|fetch failed|invalid initialization vector|cipher|jwt|stack trace|<anonymous>|Cannot read propert|undefined is not|at\s+\S+\s+\(/i

const PREFIX_PATTERN = /^(?:Error:\s*|(?:请求|操作|加载|保存|测试|连接|获取)失败[:：]\s*)/i

const MAX_MESSAGE_CHARS = 120

/**
 * 把异常或后端响应体转成可展示给 HR 的正式文案。
 *
 * @param error  catch 到的异常，或含 { error } / { message } 的响应体
 * @param fallback 无法展示原始文案时使用的业务化提示
 */
export function apiErrorMessage(error: unknown, fallback = DEFAULT_API_ERROR): string {
  const raw = extractMessage(error)
  if (!raw || raw.includes('\n') || TECHNICAL_PATTERN.test(raw)) {
    return fallback
  }

  const cleaned = raw.replace(PREFIX_PATTERN, '').trim()
  if (!cleaned) return fallback
  return cleaned.length > MAX_MESSAGE_CHARS
    ? `${cleaned.slice(0, MAX_MESSAGE_CHARS)}…`
    : cleaned
}

function extractMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>
    for (const key of ['message', 'error']) {
      const value = obj[key]
      if (typeof value === 'string' && value) return value
    }
  }
  return ''
}
