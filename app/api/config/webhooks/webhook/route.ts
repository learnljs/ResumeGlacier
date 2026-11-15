import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { testConnection } from '@/lib/services/webhook-delivery-client'
import {
  loadStoredWebhookUrl,
  saveWebhookUrl,
} from '@/lib/services/webhook-integration-store'
import {
  DEFAULT_CONFIG_KEY,
  WEBHOOK_URL_FIELD,
  TARGET_FIELD_TYPES,
} from '@/lib/constants/webhook-fields'
import { webhookErrorResponse } from '@/lib/services/webhook-error'

/**
 * 根据字段类型构造测试值
 */
function buildTestValue(fieldType: string): unknown {
  switch (fieldType) {
    case 'TEXT':
    case 'PHONE_NUMBER':
    case 'EMAIL':
    case 'BARCODE':
      return '测试'
    case 'NUMBER':
    case 'PROGRESS':
    case 'CURRENCY':
    case 'PERCENTAGE':
      return 0
    case 'CHECKBOX':
      return false
    case 'SINGLE_SELECT':
    case 'SELECT':
      return [{ text: '测试选项' }]
    case 'DATE_TIME':
      return String(Date.now())
    case 'URL':
      return [{ text: '测试链接', link: 'https://work.weixin.qq.com/' }]
    default:
      return '测试'
  }
}

/**
 * PUT /api/config/webhooks/webhook
 * 保存 Webhook URL（AES-256-GCM 加密后存储为特殊的 WebhookIntegration 记录）
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { webhookUrl } = body as { webhookUrl: string }

    if (!webhookUrl || !webhookUrl.startsWith('https://')) {
      return NextResponse.json({ error: 'Webhook 地址格式不正确' }, { status: 400 })
    }

    await saveWebhookUrl(webhookUrl)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return webhookErrorResponse(error)
  }
}

/**
 * POST /api/config/webhooks/webhook
 * 测试 Webhook 连接
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { webhookUrl } = body as { webhookUrl?: string }

    let url = webhookUrl
    if (!url) {
      // 未传 URL，从数据库读取已保存的（解密后使用）
      url = (await loadStoredWebhookUrl()) || ''
    }

    if (!url) {
      return NextResponse.json({ error: '未配置 Webhook 地址' }, { status: 400 })
    }

    // 加载所有已配置 hrField 的字段，全部纳入测试写入
    const allMappings = await prisma.webhookIntegration.findMany({
      where: {
        configKey: DEFAULT_CONFIG_KEY,
        hrField: { notIn: [WEBHOOK_URL_FIELD, ''] },
        isEnabled: true,
        targetFieldId: { not: null },
      },
    })

    let testValues: Record<string, unknown> | undefined
    if (allMappings.length > 0) {
      testValues = {}
      for (const m of allMappings) {
        // 关联字段（REFERENCE）需真实存在的被关联记录 ID，测试时无法构造有效值，跳过
        if (m.targetFieldId && m.hrField && m.targetFieldType !== 'REFERENCE') {
          testValues[m.targetFieldId] = buildTestValue(m.targetFieldType || 'TEXT')
        }
      }
    }

    const result = await testConnection(url, testValues)
    // 测试没通过就是没通过：返回非 2xx，避免任何调用方把 HTTP 200 误读成「配置好了」
    return NextResponse.json(result, { status: result.success ? 200 : 502 })
  } catch (error: unknown) {
    return webhookErrorResponse(error)
  }
}
