import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  DEFAULT_CONFIG_KEY,
  WEBHOOK_URL_FIELD,
} from '@/lib/constants/webhook-fields'
import { UNSUPPORTED_TARGET_FIELD_TYPES } from '@/lib/constants/webhook-fields'
import { webhookErrorResponse } from '@/lib/services/webhook-error'

/**
 * POST /api/config/webhooks/import-schema
 * 解析Webhook「接收外部数据」示例 JSON，提取字段定义，批量写入字段映射。
 *
 * Webhook示例 JSON 实际结构：
 * {
 *   "schema": {
 *     "FIELD_ID": { "title": "字段名", "type": "text|single_select|...", "enum": ["选项1"] },
 *     ...
 *   },
 *   "add_records": [...]
 * }
 */

// Webhook schema type → 内部 targetFieldType
function mapWecomType(schemaType: string): { fieldType: string; supported: boolean } {
  switch (schemaType) {
    case 'text':
      return { fieldType: 'TEXT', supported: true }
    case 'number':
      return { fieldType: 'NUMBER', supported: true }
    case 'checkbox':
      return { fieldType: 'CHECKBOX', supported: true }
    case 'date_time':
      return { fieldType: 'DATE_TIME', supported: true }
    case 'single_select':
      return { fieldType: 'SINGLE_SELECT', supported: true }
    case 'multiple_select':
      return { fieldType: 'SELECT', supported: true }
    case 'url':
      return { fieldType: 'URL', supported: true }
    case 'phone_number':
      return { fieldType: 'PHONE_NUMBER', supported: true }
    case 'email':
      return { fieldType: 'EMAIL', supported: true }
    case 'user':
    case 'staff':
      return { fieldType: 'USER', supported: true }
    case 'progress':
      return { fieldType: 'PROGRESS', supported: true }
    case 'currency':
      return { fieldType: 'CURRENCY', supported: true }
    case 'percentage':
      return { fieldType: 'PERCENTAGE', supported: true }
    case 'barcode':
      return { fieldType: 'BARCODE', supported: true }
    case 'location':
      return { fieldType: 'LOCATION', supported: true }
    case 'image':
      return { fieldType: 'IMAGE', supported: true }
    // 跨表关联（单向/双向）
    case 'link_records':
    case 'two_way_link_records':
      return { fieldType: 'REFERENCE', supported: true }
    // 不支持的类型
    case 'formula':
    case 'auto_number':
    case 'created_time':
    case 'modified_time':
    case 'created_user':
    case 'modified_user':
    case 'lookup':
    case 'file':
    case 'group_chat':
    default:
      return { fieldType: schemaType.toUpperCase(), supported: !UNSUPPORTED_TARGET_FIELD_TYPES.has(schemaType.toUpperCase()) }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { schemaJson, replace } = body as { schemaJson: string; replace?: boolean }

    if (!schemaJson) {
      return NextResponse.json({ error: '请提供示例 JSON' }, { status: 400 })
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(schemaJson)
    } catch {
      return NextResponse.json({ error: 'JSON 格式错误' }, { status: 400 })
    }

    // 优先使用 schema 字段（Webhook实际格式）
    const schema = parsed.schema as Record<string, { title?: string; type?: string; enum?: string[] }> | undefined

    if (!schema || typeof schema !== 'object') {
      return NextResponse.json({ error: '示例 JSON 中未找到 schema 字段' }, { status: 400 })
    }

    // 解析字段列表
    interface ParsedField {
      fieldId: string
      title: string
      fieldType: string
      enumValues: string[]
      supported: boolean
    }

    const fields: ParsedField[] = []
    for (const [fieldId, def] of Object.entries(schema)) {
      const { fieldType, supported } = mapWecomType(def.type || 'text')
      fields.push({
        fieldId,
        title: def.title || '',
        fieldType,
        enumValues: def.enum || [],
        supported,
      })
    }

    const supportedFields = fields.filter((f) => f.supported)
    const skippedFields = fields.filter((f) => !f.supported)

    // 可选：替换模式，先删除旧映射再写入
    if (replace) {
      await prisma.webhookIntegration.deleteMany({
        where: {
          configKey: DEFAULT_CONFIG_KEY,
          hrField: { not: WEBHOOK_URL_FIELD },
        },
      })
    }

    // 写入字段映射
    // transformConfig 存储枚举值列表（JSON），方便后续 AI 映射参考
    // hrField 留空待 HR 手动配置或 AI 映射填充
    const created: Array<{ id: string; targetFieldId: string; targetFieldName: string; targetFieldType: string }> = []
    for (const field of supportedFields) {
      if (!replace) {
        const exists = await prisma.webhookIntegration.findFirst({
          where: { configKey: DEFAULT_CONFIG_KEY, targetFieldId: field.fieldId },
        })
        if (exists) continue
      }

      const row = await prisma.webhookIntegration.create({
        data: {
          configKey: DEFAULT_CONFIG_KEY,
          hrField: '',
          targetFieldId: field.fieldId,
          targetFieldName: field.title,
          targetFieldType: field.fieldType,
          transformType: 'DIRECT',
          // 保存枚举值列表，供 AI 映射和手动配置参考
          transformConfig: field.enumValues.length > 0 ? JSON.stringify(field.enumValues) : null,
        },
      })
      created.push({ id: row.id, targetFieldId: row.targetFieldId!, targetFieldName: row.targetFieldName!, targetFieldType: row.targetFieldType! })
    }

    return NextResponse.json({
      imported: created.length,
      skipped: skippedFields.length,
      unsupported: skippedFields.map((f) => ({ fieldId: f.fieldId, title: f.title, fieldType: f.fieldType })),
      fields: created,
    })
  } catch (error: unknown) {
    return webhookErrorResponse(error)
  }
}
