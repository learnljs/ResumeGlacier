import { apiErrorResponse } from './api-error'

/**
 * Webhook 配置路由统一的 500 错误响应。
 * @deprecated 统一改用 `apiErrorResponse`（见 lib/services/api-error.ts）
 */
export function webhookErrorResponse(error: unknown) {
  return apiErrorResponse(error, '服务内部错误', 500)
}
