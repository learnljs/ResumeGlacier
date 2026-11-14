/**
 * 结构化数据提取 API
 * 从简历文本提取结构化数据
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { saveStructuredData } from '@/lib/services/parse-pipeline'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 解析请求体（允许空 body）
    let configId: string | undefined
    try {
      const body = await request.json()
      configId = body?.configId
    } catch {
      // 空 body 或无效 JSON，忽略 configId
    }

    // 获取简历
    const resume = await prisma.resume.findUnique({ where: { id } })
    if (!resume) {
      return NextResponse.json({ error: '简历不存在' }, { status: 404 })
    }

    // 使用简历文本进行结构化提取
    const resumeText = resume.extractedText || ''
    if (!resumeText.trim()) {
      return NextResponse.json({ error: '简历文本为空，请先重新解析简历' }, { status: 400 })
    }

    const result = await saveStructuredData(resumeText, {
      resumeId: id,
      logPrefix: '[Extract]',
      fallbackName: resume.candidateName || '',
      extractOptions: { configId },
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || '提取失败' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      model: result.model,
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}