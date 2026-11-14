import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { webhookErrorResponse } from '@/lib/services/webhook-error'

/**
 * 职位 → Webhook岗位记录 ID 映射
 * 配置页「职位映射」区块：给每个职位配置它在Webhook岗位管理表的 record_id，
 * 同步「应聘岗位」关联字段（REFERENCE）时写入。
 */

/**
 * GET /api/config/webhooks/position-mappings
 * 返回启用中的职位列表（含Webhook岗位 record_id）
 */
export async function GET() {
  try {
    const positions = await prisma.position.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        title: true,
        department: true,
        webhookTargetRecordId: true,
      },
    })
    return NextResponse.json({ positions })
  } catch (error: unknown) {
    return webhookErrorResponse(error)
  }
}

/**
 * PUT /api/config/webhooks/position-mappings
 * 批量保存职位映射
 * body: { mappings: [{ positionId, webhookTargetRecordId }] }
 * webhookTargetRecordId 为空字符串按未配置（null）处理
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { mappings } = body as {
      mappings: Array<{ positionId: string; webhookTargetRecordId?: string | null }>
    }

    if (!Array.isArray(mappings)) {
      return NextResponse.json({ error: 'mappings 必须是数组' }, { status: 400 })
    }

    // 校验同一批次内 record_id 唯一：两个职位映射到同一Webhook记录几乎必是误填，
    // 会导致两条同步都写到同一个Webhook岗位行。前端每次提交全量列表，故批内唯一即全局唯一。
    const seenRecordIds = new Set<string>()
    for (const m of mappings) {
      const rid = typeof m.webhookTargetRecordId === 'string' ? m.webhookTargetRecordId.trim() : ''
      if (!rid) continue
      if (seenRecordIds.has(rid)) {
        return NextResponse.json(
          { error: `Webhook记录 ID「${rid}」被多个职位重复配置，请检查` },
          { status: 400 }
        )
      }
      seenRecordIds.add(rid)
    }

    // 只更新启用中且存在的职位，防无效 ID 写入
    const existing = await prisma.position.findMany({
      where: { id: { in: mappings.map((m) => m.positionId) }, status: 'active' },
      select: { id: true, webhookTargetRecordId: true },
    })
    const existingMap = new Map(existing.map((p) => [p.id, p.webhookTargetRecordId]))

    // 脏检查：仅收集变化的映射，避免无谓更新整行（updatedAt 不会被无变化保存刷新）
    const updates: Array<{ id: string; webhookTargetRecordId: string | null }> = []
    let skipped = 0
    for (const m of mappings) {
      if (!existingMap.has(m.positionId)) { skipped++; continue }
      const webhookTargetRecordId = typeof m.webhookTargetRecordId === 'string' ? m.webhookTargetRecordId.trim() || null : null
      if (webhookTargetRecordId === existingMap.get(m.positionId)) continue
      updates.push({ id: m.positionId, webhookTargetRecordId })
    }

    // 单事务批量写入（SQLite 单写，事务合并 fsync/锁开销）
    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((u) =>
          prisma.position.update({ where: { id: u.id }, data: { webhookTargetRecordId: u.webhookTargetRecordId } })
        )
      )
    }

    return NextResponse.json({ success: true, updated: updates.length, skipped })
  } catch (error: unknown) {
    return webhookErrorResponse(error)
  }
}
