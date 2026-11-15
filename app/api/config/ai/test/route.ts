import { NextRequest, NextResponse } from 'next/server'
import { createOpenAIClient } from '@/lib/services/ai-config-helper'
import {
  describeConnectionError,
  evaluateChatTest,
  type ChatCompletionLike,
} from '@/lib/utils/connection-test'

/** 单次连接测试的等待上限；测试按钮不应像正式筛选那样等两分钟 */
const TEST_TIMEOUT_MS = 20_000

/**
 * POST /api/config/ai/test
 *
 * 真的向填写的接口地址发起一次模型调用，并校验「确实拿到了非空回复」。
 * 失败一律返回非 2xx 且 success=false，避免前端 / 监控把失败当成通过。
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, message: '请求格式错误，请重新填写后重试' },
      { status: 400 },
    )
  }

  const { apiKey, baseUrl, model } = (body || {}) as {
    apiKey?: unknown
    baseUrl?: unknown
    model?: unknown
  }

  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    return NextResponse.json(
      { success: false, message: '请填写 API Key' },
      { status: 400 },
    )
  }
  if (baseUrl !== undefined && baseUrl !== null && baseUrl !== '') {
    if (typeof baseUrl !== 'string' || !/^https?:\/\//i.test(baseUrl)) {
      return NextResponse.json(
        { success: false, message: '接口地址需以 http:// 或 https:// 开头' },
        { status: 400 },
      )
    }
  }
  const effectiveModel =
    typeof model === 'string' && model.trim() ? model.trim() : 'gpt-4o'

  try {
    const client = createOpenAIClient(
      apiKey.trim(),
      typeof baseUrl === 'string' ? baseUrl : undefined,
    )

    const response = await client.chat.completions.create(
      {
        model: effectiveModel,
        messages: [{ role: 'user', content: '请只回复"连接成功"四个字，不要输出其他内容' }],
        max_tokens: 20,
        temperature: 0,
      },
      { timeout: TEST_TIMEOUT_MS },
    )

    const verdict = evaluateChatTest(response as ChatCompletionLike, effectiveModel)
    if (!verdict.success) {
      return NextResponse.json(
        { success: false, message: verdict.message, model: effectiveModel },
        { status: 502 },
      )
    }

    return NextResponse.json({
      success: true,
      message: verdict.message,
      reply: verdict.reply,
      model: verdict.model,
      tokenUsage: verdict.tokenUsage ?? 0,
    })
  } catch (error: unknown) {
    // 失败详情（模型名错误、Key 无效、连接超时）是 HR 排障需要的信息
    return NextResponse.json(
      {
        success: false,
        message: describeConnectionError(error, TEST_TIMEOUT_MS),
        model: effectiveModel,
      },
      { status: 502 },
    )
  }
}
