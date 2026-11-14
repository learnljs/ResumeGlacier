import { NextResponse } from 'next/server'

/**
 * API 路由统一的错误响应（B7-3）。
 *
 * 背景：全仓约 88 处 `NextResponse.json({ error: error.message })` 直接把
 * Prisma/SQL/AI SDK 内部文本回给客户端（S6）。本函数统一收敛：
 * - 生产环境：返回固定的中文 fallbackMsg，内部异常仅 console.error 记录，不泄漏给客户端
 * - 开发环境：保留 error.message，便于本地调试
 * - 支持自定义状态码（默认 500）
 *
 * 用法：
 * ```ts
 * return apiErrorResponse(error, '获取列表失败')
 * return apiErrorResponse(error, '参数不合法', 400)
 * ```
 */
export function apiErrorResponse(
  error: unknown,
  fallbackMsg = '服务器内部错误',
  status = 500
): NextResponse {
  const message = error instanceof Error ? error.message : '未知错误'

  // 生产环境不泄漏内部异常，仅记录日志以便排查
  if (process.env.NODE_ENV === 'production') {
    console.error(`[api] ${fallbackMsg}:`, error)
    return NextResponse.json({ error: fallbackMsg }, { status })
  }

  return NextResponse.json({ error: message }, { status })
}

/**
 * 兼容旧导入：webhook 配置路由专用的 500 错误响应。
 * 等价于 `apiErrorResponse(error, '服务内部错误', 500)`，保留以防旧调用点未迁移。
 * @deprecated 新代码直接用 apiErrorResponse
 */
export function webhookErrorResponse(error: unknown) {
  return apiErrorResponse(error, '服务内部错误', 500)
}
