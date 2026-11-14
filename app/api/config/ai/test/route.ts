import { NextResponse } from 'next/server'
import { createOpenAIClient } from '@/lib/services/ai-config-helper'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { apiKey, baseUrl, model } = body as {
      apiKey: string
      baseUrl?: string
      model: string
    }

    if (!apiKey) {
      return NextResponse.json({ error: '请填写 API Key' }, { status: 400 })
    }

    const client = createOpenAIClient(apiKey, baseUrl)

    const response = await client.chat.completions.create({
      model: model || 'gpt-4o',
      messages: [{ role: 'user', content: '请回复"连接成功"四个字' }],
      max_tokens: 20,
    })

    const content = response.choices[0]?.message?.content || ''

    return NextResponse.json({
      success: true,
      message: `模型连接成功，回复: ${content}`,
      model: response.model,
    })
  } catch (error: unknown) {
    // B7-3 例外：AI 连接测试的失败详情（如模型名错误、key 无效）是诊断输出，需保留给 HR 排障
    const message = error instanceof Error ? error.message : '未知错误'
    return NextResponse.json(
      { success: false, message: `连接失败: ${message}` },
      { status: 200 }
    )
  }
}
