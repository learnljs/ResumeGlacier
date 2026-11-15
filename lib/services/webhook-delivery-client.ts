/**
 * Webhook 客户端
 *
 * 封装对Webhook「接收外部数据」Webhook 的 HTTP POST 调用。
 * 文档：https://developer.work.weixin.qq.com/document/path/101240（添加记录）
 *       https://developer.work.weixin.qq.com/document/path/101241（更新记录）
 *
 * 鉴权：URL 中的 key 参数，无额外认证。
 * 错误分类：
 *   - 4xx：不重试（请求格式错误、字段不存在等）
 *   - 5xx / 网络错误：可重试
 */

// Webhook 响应
interface WebhookResponse {
  errcode: number
  errmsg: string
  add_records?: Array<{ record_id: string; values?: Record<string, unknown> }>
  update_records?: Array<{ record_id: string; values?: Record<string, unknown> }>
}

// 单条记录的值（字段ID -> 字段值）
export type WebhookRecordValues = Record<string, unknown>

// 新增记录请求项
export interface AddRecordPayload {
  values: WebhookRecordValues
}

// 更新记录请求项
export interface UpdateRecordPayload {
  record_id: string
  values: WebhookRecordValues
}

// 推送结果
export interface PushResult {
  success: boolean
  errcode: number
  errmsg: string
  // 新增成功后返回的 record_id（与请求顺序一致）
  recordIds: string[]
  // 是否可重试（5xx/网络错误为 true，4xx 为 false）
  retryable: boolean
  raw?: WebhookResponse
}

/**
 * 调用Webhook（内部方法）
 */
async function callWebhook(
  url: string,
  body: Record<string, unknown>,
  timeoutMs = 15000
): Promise<{ response: WebhookResponse; status: number }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    let json: WebhookResponse
    try {
      json = (await res.json()) as WebhookResponse
    } catch {
      // 响应非 JSON，构造一个错误响应
      json = { errcode: res.status, errmsg: `HTTP ${res.status}: 响应非 JSON` }
    }

    return { response: json, status: res.status }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 批量新增记录
 * @param url Webhook 地址
 * @param records 记录数组
 * @returns 推送结果（recordIds 与请求顺序一致）
 */
export async function addRecords(
  url: string,
  records: AddRecordPayload[]
): Promise<PushResult> {
  if (records.length === 0) {
    return { success: true, errcode: 0, errmsg: 'ok', recordIds: [], retryable: false }
  }

  try {
    const { response, status } = await callWebhook(url, { add_records: records })

    // errcode === 0 表示成功
    if (response.errcode === 0) {
      const recordIds = (response.add_records || []).map((r) => r.record_id)
      return {
        success: true,
        errcode: 0,
        errmsg: 'ok',
        recordIds,
        retryable: false,
        raw: response,
      }
    }

    // 业务错误：4xx 类不重试，5xx 类可重试
    const retryable = status >= 500 || response.errcode >= 500
    return {
      success: false,
      errcode: response.errcode,
      errmsg: response.errmsg || `HTTP ${status}`,
      recordIds: [],
      retryable,
      raw: response,
    }
  } catch (error: unknown) {
    // 网络错误/超时，可重试
    const msg = error instanceof Error ? error.message : '网络请求失败'
    return {
      success: false,
      errcode: -1,
      errmsg: msg,
      recordIds: [],
      retryable: true,
    }
  }
}

/**
 * 批量更新记录
 * @param url Webhook 地址
 * @param records 更新记录数组（含 record_id）
 */
export async function updateRecords(
  url: string,
  records: UpdateRecordPayload[]
): Promise<PushResult> {
  if (records.length === 0) {
    return { success: true, errcode: 0, errmsg: 'ok', recordIds: [], retryable: false }
  }

  try {
    const { response, status } = await callWebhook(url, { update_records: records })

    if (response.errcode === 0) {
      const recordIds = (response.update_records || []).map((r) => r.record_id)
      return {
        success: true,
        errcode: 0,
        errmsg: 'ok',
        recordIds,
        retryable: false,
        raw: response,
      }
    }

    const retryable = status >= 500 || response.errcode >= 500
    return {
      success: false,
      errcode: response.errcode,
      errmsg: response.errmsg || `HTTP ${status}`,
      recordIds: [],
      retryable,
      raw: response,
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '网络请求失败'
    return {
      success: false,
      errcode: -1,
      errmsg: msg,
      recordIds: [],
      retryable: true,
    }
  }
}

/**
 * 测试 Webhook 连接
 * 发送一条真实的 add_records 请求，只有「HTTP 2xx + errcode=0」才算通过。
 *
 * 注意：这会真实写入一条记录到 Webhook 表格，测试记录需 HR 在 Webhook 端手动删除。
 * 旧实现在「没导入字段、写入被拒」时仍返回 success=true（只是说"连接可达"），
 * 属于典型假成功：地址没错，但这套配置根本推不了数据。现在统一按真实结果判定。
 *
 * @param url Webhook 地址
 * @param testValues 可选的测试字段值（从已导入的字段映射构造）
 * @returns { success, message }
 */
export async function testConnection(
  url: string,
  testValues?: Record<string, unknown>
): Promise<{ success: boolean; message: string }> {
  if (!url || !url.startsWith('https://qyapi.weixin.qq.com/')) {
    return { success: false, message: 'Webhook 地址格式不正确，应以 https://qyapi.weixin.qq.com/ 开头' }
  }

  const values = testValues && Object.keys(testValues).length > 0
    ? testValues
    : {}
  const hasTestData = Object.keys(values).length > 0

  try {
    const { response, status } = await callWebhook(
      url,
      { add_records: [{ values }] },
      10000
    )

    // 唯一成功条件：HTTP 通过，且 Webhook 端明确返回 errcode=0
    if (status >= 200 && status < 300 && response.errcode === 0) {
      return {
        success: true,
        message: hasTestData
          ? '连接成功：已按当前字段映射写入一条测试记录'
          : '连接成功：Webhook 地址可用（尚未导入字段映射，测试记录为空值）',
      }
    }

    const fieldHint = response.errmsg?.includes('field not exists')
      ? '；字段 ID 与目标表格不匹配，请确认示例 JSON 与当前 Webhook 地址属于同一张表'
      : ''
    const noMappingHint = !hasTestData
      ? '；当前还没有导入字段映射，请先点「导入示例 JSON」再测试'
      : ''

    return {
      success: false,
      message: `测试未通过：HTTP ${status}，errcode ${response.errcode ?? '未知'}，${response.errmsg || '接口未返回成功'}${fieldHint}${noMappingHint}`,
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '网络请求失败'
    return { success: false, message: `测试未通过：请求未成功发出（${msg}）` }
  }
}
