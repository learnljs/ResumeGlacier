/**
 * 「测试连接」结果判定（纯函数，可单测）
 *
 * 背景：OpenAI 兼容接口在 key 无效、模型名写错、额度耗尽时，有时仍返回
 * HTTP 200，只是响应体里没有 choices 或 content 为空；旧实现把这种情况
 * 一律当成 success=true，导致「明明没配上却显示测试通过」。
 *
 * 这里只认一种成功：真的拿到了模型返回的非空文本。其余一律判失败，
 * 并给出人能看懂的原因，供 HR 排障。
 */

export interface ChatCompletionLike {
  choices?: Array<{
    message?: { content?: string | null } | null
    finish_reason?: string | null
  }> | null
  model?: string | null
  usage?: { total_tokens?: number | null } | null
}

export interface ConnectionVerdict {
  success: boolean
  message: string
  reply?: string
  model?: string
  tokenUsage?: number
}

/** 判断 AI 测试是否真的拿到了回复文本 */
export function evaluateChatTest(
  response: ChatCompletionLike | null | undefined,
  requestedModel?: string,
): ConnectionVerdict {
  if (!response || !Array.isArray(response.choices) || response.choices.length === 0) {
    return {
      success: false,
      message: '连接失败：接口没有返回任何模型回复（请检查 API Key、接口地址与模型名）',
    }
  }

  const first = response.choices[0]
  const raw = first?.message?.content
  const reply = typeof raw === 'string' ? raw.trim() : ''

  if (!reply) {
    return {
      success: false,
      message: '连接失败：模型回复为空（可能是模型名错误、Key 无权限或额度不足）',
    }
  }

  const model = response.model || requestedModel
  return {
    success: true,
    message: `连接成功：模型真实返回了内容「${reply.slice(0, 60)}」${model ? `（模型 ${model}）` : ''}`,
    reply,
    model,
    tokenUsage: response.usage?.total_tokens ?? undefined,
  }
}

/** 把测试接口的异常转成可读文案；超时单独提示，避免误以为配置有问题 */
export function describeConnectionError(error: unknown, timeoutMs?: number): string {
  const raw = error instanceof Error ? error.message : String(error)
  if (/timeout|aborted|timed out/i.test(raw)) {
    return timeoutMs
      ? `连接超时（超过 ${Math.round(timeoutMs / 1000)} 秒未响应），请检查接口地址与网络`
      : '连接超时，请检查接口地址与网络'
  }
  return `连接失败：${raw}`
}
