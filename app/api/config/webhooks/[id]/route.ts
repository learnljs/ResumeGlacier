import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  DEFAULT_CONFIG_KEY,
  WEBHOOK_URL_FIELD,
} from '@/lib/constants/webhook-fields'
import { webhookErrorResponse } from '@/lib/services/webhook-error'

/**
 * PUT /api/config/webhooks/[id]
 * 更新一条字段映射
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { hrField, targetFieldId, targetFieldName, targetFieldType, transformType, transformConfig, isEnabled } = body as {
      hrField?: string
      targetFieldId?: string | null
      targetFieldName?: string | null
      targetFieldType?: string | null
      transformType?: string
      transformConfig?: string | null
      isEnabled?: boolean
    }

    const existing = await prisma.webhookIntegration.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '映射记录不存在' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (hrField !== undefined) data.hrField = hrField
    if (targetFieldId !== undefined) data.targetFieldId = targetFieldId || null
    if (targetFieldName !== undefined) data.targetFieldName = targetFieldName || null
    if (targetFieldType !== undefined) data.targetFieldType = targetFieldType || null
    if (transformType !== undefined) data.transformType = transformType
    if (transformConfig !== undefined) data.transformConfig = transformConfig || null
    if (isEnabled !== undefined) data.isEnabled = isEnabled

    const mapping = await prisma.webhookIntegration.update({ where: { id }, data })
    return NextResponse.json({ mapping })
  } catch (error: unknown) {
    return webhookErrorResponse(error)
  }
}

/**
 * DELETE /api/config/webhooks/[id]
 * 删除一条字段映射
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const existing = await prisma.webhookIntegration.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '映射记录不存在' }, { status: 404 })
    }

    await prisma.webhookIntegration.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return webhookErrorResponse(error)
  }
}
