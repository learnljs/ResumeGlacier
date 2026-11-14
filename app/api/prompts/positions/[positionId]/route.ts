import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/services/api-error'
import { prisma } from '@/lib/prisma'
import { savePromptAsNewVersion } from '@/lib/services/prompt-service'

interface Params {
  params: Promise<{ positionId: string }>
}

/**
 * GET /api/prompts/positions/[positionId]
 * 获取某职位的当前提示词（开发方案 6.1）
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { positionId } = await params
    const record = await prisma.promptRecord.findFirst({
      where: { positionId, isCurrent: true },
      orderBy: { version: 'desc' },
    })

    if (!record) {
      return NextResponse.json(
        { error: '该职位尚未配置提示词', configured: false },
        { status: 404 },
      )
    }

    return NextResponse.json({ prompt: record, configured: true })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}

/**
 * PUT /api/prompts/positions/[positionId]
 * 保存某职位提示词为新版本（开发方案 6.1、8 保存流程）
 * body: { bodyText, knowledgeContent, skillContent, overallRules, changeNote?, savedBy? }
 * 触发静态校验；AI 预览校验由前端单独调 /api/prompts/preview
 */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { positionId } = await params
    const body = await request.json()
    const { bodyText, knowledgeContent, skillContent, overallRules, changeNote, savedBy } = body as {
      bodyText?: string
      knowledgeContent?: string
      skillContent?: string
      overallRules?: string
      changeNote?: string
      savedBy?: string
    }

    if (
      typeof bodyText !== 'string' ||
      typeof knowledgeContent !== 'string' ||
      typeof skillContent !== 'string' ||
      typeof overallRules !== 'string'
    ) {
      return NextResponse.json(
        { error: '缺少必要字段：bodyText / knowledgeContent / skillContent / overallRules' },
        { status: 400 },
      )
    }

    const position = await prisma.position.findUnique({
      where: { id: positionId },
      select: { id: true },
    })
    if (!position) {
      return NextResponse.json({ error: '职位不存在' }, { status: 404 })
    }

    const result = await savePromptAsNewVersion(positionId, {
      bodyText,
      knowledgeContent,
      skillContent,
      overallRules,
      changeNote,
      savedBy,
    })

    if (!result.success) {
      return NextResponse.json({ error: '校验失败', errors: result.errors }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      prompt: result.record,
      message: `已保存为 v${result.record.version}`,
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
