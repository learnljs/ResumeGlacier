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
 * 发送一条含真实测试值的 add_records 请求，检查 errcode 是否为 0。
 *
 * 注意：这会真实写入一条记录到Webhook表格。测试记录可由 HR 在Webhook端手动删除。
 *
 * @param url Webhook 地址
 * @param testValues 可选的测试字段值（如从第一个映射字段构造）。为空时仅做 HTTP 连通性检查。
 * @returns { success, message }
 */
export async function testConnection(
  url: string,
  testValues?: Record<string, unknown>
): Promise<{ success: boolean; message: string }> {
  if (!url || !url.startsWith('https://qyapi.weixin.qq.com/')) {
    return { success: false, message: 'Webhook 地址格式不正确，应以 https://qyapi.weixin.qq.com/ 开头' }
  }

  // 如果有测试值，发送真实写入请求
  // 否则发空 values 仅检查 HTTP 连通性（不创建记录，仅验证网络可达）
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

    if (response.errcode === 0) {
      return { success: true, message: '连接成功，已写入一条测试记录' }
    }

    // errcode 非 0 的处理
    if (hasTestData) {
      // 有测试数据但写入失败 → 真实错误，可能是字段 ID 与表格不匹配
      const hint = response.errmsg?.includes('field not exists')
        ? `\n字段 ID 与目标表格不匹配，请确认导入的示例 JSON 来源与当前 Webhook 地址对应的是同一个表格`
        : ''
      return {
        success: false,
        message: `写入失败：${response.errmsg || 'errcode ' + response.errcode}${hint}`,
      }
    }

    // 无测试数据，仅 HTTP 连通性检查——errcode 非 0 但 HTTP 通了也算连接正常
    if (status >= 200 && status < 500) {
      return {
        success: true,
        message: `连接可达（但未写入记录，建议导入字段后再测试）`,
      }
    }

    return {
      success: false,
      message: `连接失败：HTTP ${status}，${response.errmsg || '未知错误'}`,
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '网络请求失败'
    return { success: false, message: `连接失败：${msg}` }
  }
}
