import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/services/api-error'
import { prisma } from '@/lib/prisma'
import { getAIConfigByPurpose } from '@/lib/services/ai-config-helper'
import { computeWeightedScore } from '@/lib/services/evaluation-service'
import {
  assemblePrompt,
  validateAIOutput,
  getInitialWeights,
} from '@/lib/services/prompt-assembler'

/**
 * POST /api/prompts/preview
 * 用指定提示词 + 指定简历调 AI，返回完整评估结果（开发方案 6.2）
 * body: { bodyText, knowledgeContent, skillContent, overallRules, resumeId, positionId? }
 *
 * 校验逻辑复用预览接口（开发方案 6.2）：后端分别调用 parseDimensionMarkdown 解析两维度，
 * 再动态生成 schema 逐项验证。预览超时 30 秒。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { bodyText, knowledgeContent, skillContent, overallRules, resumeId, positionId } = body as {
      bodyText?: string
      knowledgeContent?: string
      skillContent?: string
      overallRules?: string
      resumeId?: string
      positionId?: string
    }

    if (
      !bodyText ||
      !knowledgeContent ||
      !skillContent ||
      !overallRules ||
      !resumeId
    ) {
      return NextResponse.json(
        { error: '缺少必要字段：bodyText / knowledgeContent / skillContent / overallRules / resumeId' },
        { status: 400 },
      )
    }

    const resume = await prisma.resume.findUnique({
      where: { id: resumeId },
      select: { extractedText: true, positionId: true },
    })
    if (!resume) {
      return NextResponse.json({ error: '简历不存在' }, { status: 404 })
    }
    if (!resume.extractedText) {
      return NextResponse.json({ error: '简历文本未提取，无法预览' }, { status: 400 })
    }

    const effectivePositionId = positionId || resume.positionId
    if (!effectivePositionId) {
      return NextResponse.json(
        { error: '简历未分配职位，且未指定 positionId，无法预览（缺少职位上下文）' },
        { status: 400 },
      )
    }

    const position = await prisma.position.findUnique({
      where: { id: effectivePositionId },
      select: { title: true, description: true, requirements: true },
    })
    if (!position) {
      return NextResponse.json({ error: '职位不存在' }, { status: 404 })
    }

    const weights = await getInitialWeights(effectivePositionId)

    const { systemPrompt, userPrompt, knowledgeData, skillData } = assemblePrompt({
      bodyText,
      knowledgeContent,
      skillContent,
      overallRules,
      positionTitle: position.title,
      positionDescription: position.description,
      requirements: position.requirements,
      resumeText: resume.extractedText,
      knowledgeWeight: weights.knowledgeWeight,
      skillWeight: weights.skillWeight,
    })

    const { client, model } = await getAIConfigByPurpose('screening')

    // 诊断日志：prompt 大小（超时时据此判断是否 prompt 过大）
    const promptChars = systemPrompt.length + userPrompt.length
    console.log(`[preview] positionId=${effectivePositionId} model=${model} promptChars=${promptChars} (system=${systemPrompt.length} user=${userPrompt.length}) resumeChars=${resume.extractedText.length}`)
    console.log(`[preview] knowledgeData: ${knowledgeData.directions.length} 方向 / ${knowledgeData.directions.reduce((s, d) => s + d.questions.length, 0)} 题`)
    console.log(`[preview] skillData: ${skillData.directions.length} 方向 / ${skillData.directions.reduce((s, d) => s + d.questions.length, 0)} 题`)

    const aiStart = Date.now()
    // 预览超时 120 秒（完整 prompt 含 31 题 + 评分规则 + JSON 模板，AI 处理耗时长）
    const TIMEOUT_MS = 120_000
    const aiPromise = client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 16000,
    })
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        const elapsed = Math.round((Date.now() - aiStart) / 1000)
        reject(new Error(`AI 校验预览超时（${elapsed}s），promptChars=${promptChars} model=${model}`))
      }, TIMEOUT_MS)
    })

    let response
    try {
      response = await Promise.race([aiPromise, timeoutPromise])
      console.log(`[preview] AI 调用成功，耗时 ${Math.round((Date.now() - aiStart) / 1000)}s，finish_reason=${response.choices[0]?.finish_reason}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'AI 调用失败'
      console.error(`[preview] AI 调用失败: ${msg}`)
      return NextResponse.json({ error: msg }, { status: 504 })
    }

    const content = response.choices[0]?.message?.content || ''
    const parsed = parseJson(content)
    if (!parsed) {
      return NextResponse.json(
        { error: 'AI 返回格式异常，无法解析为 JSON', rawContent: content.slice(0, 500) },
        { status: 422 },
      )
    }

    const validation = validateAIOutput(parsed, knowledgeData, skillData)
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'AI 返回结构校验失败', errors: validation.errors, result: parsed },
        { status: 422 },
      )
    }

    // 按初筛权重模型算分（公式与 evaluation-service.ts 一致：star × weight/5 求和）
    const score = computeInitialScore(parsed, weights)

    return NextResponse.json({
      success: true,
      result: parsed,
      model: response.model || model,
      tokenUsage: response.usage?.total_tokens || 0,
      score,
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}

/** 解析 AI 返回 JSON，兼容前后带说明文字 */
function parseJson(content: string): Record<string, unknown> | null {
  try {
    return JSON.parse(content)
  } catch {
    const m = content.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        return JSON.parse(m[0])
      } catch {
        return null
      }
    }
    return null
  }
}

/** 按初筛权重模型算分（公式：star × weight/5 求和，与 evaluation-service.ts 一致） */
function computeInitialScore(
  parsed: Record<string, unknown>,
  weights: { knowledgeWeight: number; skillWeight: number },
) {
  const k = parsed.knowledge as { star?: number } | undefined
  const s = parsed.skill as { star?: number } | undefined
  const kStar = k?.star ?? 0
  const sStar = s?.star ?? 0
  const kScore = computeWeightedScore(kStar, weights.knowledgeWeight)
  const sScore = computeWeightedScore(sStar, weights.skillWeight)
  return {
    total: Number((kScore + sScore).toFixed(1)),
    breakdown: [
      { dim: '知识', star: kStar, weight: weights.knowledgeWeight, score: kScore },
      { dim: '技能', star: sStar, weight: weights.skillWeight, score: sScore },
    ],
  }
}
