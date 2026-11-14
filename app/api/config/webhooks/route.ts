import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { testConnection } from '@/lib/services/webhook-delivery-client'
import {
  decryptWebhookUrl,
  maskWebhookUrl,
} from '@/lib/services/webhook-integration-store'
import {
  DEFAULT_CONFIG_KEY,
  WEBHOOK_URL_FIELD,
} from '@/lib/constants/webhook-fields'
import { webhookErrorResponse } from '@/lib/services/webhook-error'

/**
 * GET /api/config/webhooks
 * 返回当前配置：Webhook URL（脱敏）+ 字段映射列表
 * 注：Webhook URL 加密存储，返回时解密后脱敏展示，前端保存需重新输入完整 URL
 */
export async function GET() {
  try {
    const rows = await prisma.webhookIntegration.findMany({
      where: { configKey: DEFAULT_CONFIG_KEY },
      orderBy: { createdAt: 'asc' },
    })

    // 分离 Webhook URL 行和映射行
    const webhookRow = rows.find((r) => r.hrField === WEBHOOK_URL_FIELD)
    const mappings = rows
      .filter((r) => r.hrField !== WEBHOOK_URL_FIELD)
      .map((r) => ({
        id: r.id,
        hrField: r.hrField,
        targetFieldId: r.targetFieldId,
        targetFieldName: r.targetFieldName,
        targetFieldType: r.targetFieldType,
        transformType: r.transformType,
        transformConfig: r.transformConfig,
        isEnabled: r.isEnabled,
      }))

    return NextResponse.json({
      webhookUrl: webhookRow?.transformConfig
        ? maskWebhookUrl(decryptWebhookUrl(webhookRow.transformConfig).url)
        : '',
      webhookUrlConfigured: !!webhookRow?.transformConfig,
      mappings,
    })
  } catch (error: unknown) {
    return webhookErrorResponse(error)
  }
}

/**
 * POST /api/config/webhooks
 * 新增一条字段映射
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { hrField, targetFieldId, targetFieldName, targetFieldType, transformType, transformConfig } = body as {
      hrField: string
      targetFieldId?: string | null
      targetFieldName?: string | null
      targetFieldType?: string | null
      transformType?: string
      transformConfig?: string | null
    }

    if (!hrField) {
      return NextResponse.json({ error: 'HR 字段路径不能为空' }, { status: 400 })
    }

    const mapping = await prisma.webhookIntegration.create({
      data: {
        configKey: DEFAULT_CONFIG_KEY,
        hrField,
        targetFieldId: targetFieldId || null,
        targetFieldName: targetFieldName || null,
        targetFieldType: targetFieldType || null,
        transformType: transformType || 'DIRECT',
        transformConfig: transformConfig || null,
      },
    })

    return NextResponse.json({ mapping })
  } catch (error: unknown) {
    return webhookErrorResponse(error)
  }
}
