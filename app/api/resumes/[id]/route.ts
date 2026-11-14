import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { candidateName } = body as { candidateName?: unknown }

    // 校验：字符串、trim 后非空、≤50 字符
    if (typeof candidateName !== 'string') {
      return NextResponse.json({ error: 'candidateName 必须为字符串' }, { status: 400 })
    }
    const trimmed = candidateName.trim()
    if (!trimmed) {
      return NextResponse.json({ error: '候选人姓名不能为空' }, { status: 400 })
    }
    if (trimmed.length > 50) {
      return NextResponse.json({ error: '候选人姓名不能超过50个字符' }, { status: 400 })
    }

    const resume = await prisma.resume.findUnique({ where: { id } })
    if (!resume) {
      return NextResponse.json({ error: '简历不存在' }, { status: 404 })
    }

    // 同步修正 structuredData.name（与解析流程的既有约定保持一致）
    let structuredData = resume.structuredData
    if (structuredData) {
      try {
        const data = JSON.parse(structuredData) as Record<string, unknown>
        if (data && typeof data === 'object') {
          data.name = trimmed
          structuredData = JSON.stringify(data)
        }
      } catch {
        // 结构化数据损坏则不动，仅更新 candidateName
      }
    }

    const updated = await prisma.resume.update({
      where: { id },
      data: {
        candidateName: trimmed,
        ...(structuredData !== resume.structuredData ? { structuredData } : {}),
      },
    })

    // Webhook重同步：仅对已同步过的跟进记录触发 UPDATE（未同步的无需处理，下次同步自然用新名）
    const syncedRecords = await prisma.followUpRecord.findMany({
      where: { resumeId: id, webhookTargetRecordId: { not: null } },
      select: { id: true },
    })
    const { webhookDeliveryQueue } = await import('@/lib/services/webhook-delivery-queue')
    for (const record of syncedRecords) {
      void webhookDeliveryQueue.enqueue(record.id, 'UPDATE').catch(err => {
        console.error('[NameEdit] Webhook重同步入队失败 resumeId=' + id + ' recordId=' + record.id, err)
      })
    }

    return NextResponse.json({ success: true, resume: updated })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const resume = await prisma.resume.findUnique({
      where: { id },
      include: {
        email: true,
        position: true,
        evaluations: {
          include: {
            aiConfig: { select: { id: true, alias: true, provider: true, model: true } },
            position: { select: { id: true, title: true } },
            followUpRecord: { select: { id: true } },
          },
        },
        resumeSource: { select: { id: true, name: true } },
        emailConfig: { select: { id: true, alias: true, user: true } },
      },
    })

    if (!resume) {
      return NextResponse.json({ error: '简历不存在' }, { status: 404 })
    }

    return NextResponse.json({ resume })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
