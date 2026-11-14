import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/services/api-error'
import { getCurrentPromptRecord, parseDimensionMarkdown } from '@/lib/services/prompt-assembler'

/**
 * GET /api/prompts/questions?positionId=
 * 获取指定职位的当前生效问题文本列表（开发方案 6.3）
 * 返回 [{ dimension, direction, key, text, criteria }]
 * key 由系统按解析顺序自动生成（知识/技能各自从 1 开始）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const positionId = searchParams.get('positionId')

    if (!positionId) {
      return NextResponse.json({ error: '缺少 positionId 参数' }, { status: 400 })
    }

    const record = await getCurrentPromptRecord(positionId)
    if (!record) {
      return NextResponse.json({ error: '该职位尚未配置提示词' }, { status: 404 })
    }

    const knowledgeData = parseDimensionMarkdown(record.knowledgeContent)
    const skillData = parseDimensionMarkdown(record.skillContent)

    const questions: Array<{
      dimension: string
      direction: string
      key: string
      text: string
      criteria: string
    }> = []

    knowledgeData.directions.forEach((dir, di) => {
      dir.questions.forEach((q, qi) => {
        questions.push({
          dimension: 'knowledge',
          direction: dir.name,
          key: `${di + 1}.${qi + 1}`,
          text: q.text,
          criteria: q.criteria,
        })
      })
    })
    skillData.directions.forEach((dir, di) => {
      dir.questions.forEach((q, qi) => {
        questions.push({
          dimension: 'skill',
          direction: dir.name,
          key: `${di + 1}.${qi + 1}`,
          text: q.text,
          criteria: q.criteria,
        })
      })
    })

    return NextResponse.json({ questions })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
