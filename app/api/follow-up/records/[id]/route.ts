import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { webhookDeliveryQueue } from '@/lib/services/webhook-delivery-queue'
import { validateTransition, STATUS_CN as TRANSITION_CN } from '@/lib/services/follow-up-transitions'
import { contactResultLabel } from '@/lib/constants/contact-result'

/** 格式化 datetime-local 值：2026-06-07T10:26 → 2026-06-07 10:26 */
function fmtDatetime(v: string) {
  return v.replace('T', ' ')
}

const STATUS_CN: Record<string, string> = { ACTIVE: '跟进中', ...TRANSITION_CN }

/**
 * Webhook 集成触发判断（不阻塞响应）
 * 同步门槛：候选人进入「待面试」及之后阶段才同步（见 doc/product/跟进管理数据和Webhook文档同步.md）
 * - 沟通中状态：不触发
 * - 不合适状态：未同步过（无 webhookTargetRecordId）且来源非已面试（未进入待面试及之后阶段）→ 不触发
 * - 有 webhookTargetRecordId：走更新
 * - 无 webhookTargetRecordId 且非沟通中/不合适：首次新增
 * @param prevStatus 变更前状态（仅状态变更时传入；单字段更新不传）
 */
async function triggerSyncIfNeeded(followUpRecordId: string, prevStatus?: string): Promise<void> {
  try {
    const record = await prisma.followUpRecord.findUnique({
      where: { id: followUpRecordId },
      select: { status: true, webhookTargetRecordId: true },
    })
    if (!record) return

    // 沟通中阶段不同步
    if (record.status === 'CONTACTING') return

    // 不合适：仅当已同步过（有 webhookTargetRecordId）或本次是状态变更且来源为已面试（已进入待面试及之后阶段）
    // 才同步；沟通中直接标记不合适（未进入待面试）或未同步过的记录编辑字段，均不触发
    if (record.status === 'UNSUITABLE' && !record.webhookTargetRecordId && prevStatus !== 'INTERVIEWED') return

    const action = record.webhookTargetRecordId ? 'UPDATE' : 'ADD'
    await webhookDeliveryQueue.enqueue(followUpRecordId, action)
  } catch (error: unknown) {
    // 同步触发失败不影响主流程
    console.error('[follow-up] 触发Webhook 集成失败:', error)
  }
}
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const record = await prisma.followUpRecord.findUnique({
      where: { id },
      include: {
        tags: { include: { followUpTag: true } },
        logs: { orderBy: { createdAt: 'desc' } },
        resume: {
          select: {
            id: true,
            candidateName: true,
            candidatePhone: true,
            candidateEmail: true,
          },
        },
      },
    })

    if (!record) {
      return NextResponse.json({ error: '跟进记录不存在' }, { status: 404 })
    }

    return NextResponse.json({ record })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { status, interviewTime, startDate, rejectReason, resignedAt, resignReason, note, tagIds, contacted, rollbackReason } = body

    const record = await prisma.followUpRecord.findUnique({ where: { id } })
    if (!record) {
      return NextResponse.json({ error: '跟进记录不存在' }, { status: 404 })
    }

    // 单字段更新：note/interviewTime/startDate/resignedAt/contacted/rejectReason/resignReason
    // 各自独立，请求只能携带其中一个（否则会静默丢字段）。状态变更走下方统一逻辑。
    const singleEditFields = [note, interviewTime, startDate, resignedAt, contacted, rejectReason, resignReason]
    const singleEditCount = singleEditFields.filter((v) => v !== undefined).length
    const onlyField = (v: unknown) => !status && singleEditCount === 1 && v !== undefined

    // 单独更新备注（不需要状态变更）
    if (onlyField(note)) {
      const updated = await prisma.followUpRecord.update({
        where: { id },
        data: { note },
      })

      await prisma.followUpLog.create({
        data: {
          followUpRecordId: id,
          action: 'NOTE_CHANGE',
          detail: note ? `备注更新: ${note}` : '备注已清空',
        },
      })

      void triggerSyncIfNeeded(id)
      return NextResponse.json({ record: updated })
    }

    // 单独更新面试时间
    if (onlyField(interviewTime)) {
      const oldTime = record.interviewTime
      const updated = await prisma.followUpRecord.update({
        where: { id },
        data: { interviewTime },
      })

      await prisma.followUpLog.create({
        data: {
          followUpRecordId: id,
          action: 'INTERVIEW_TIME_CHANGE',
          detail: `面试时间从「${oldTime || '未设置'}」变更为「${interviewTime || '已清除'}」`,
        },
      })

      void triggerSyncIfNeeded(id)
      return NextResponse.json({ record: updated })
    }

    // 单独更新入职时间
    if (onlyField(startDate)) {
      const oldDate = record.startDate
      const updated = await prisma.followUpRecord.update({
        where: { id },
        data: { startDate },
      })

      await prisma.followUpLog.create({
        data: {
          followUpRecordId: id,
          action: 'START_DATE_CHANGE',
          detail: `入职时间从「${oldDate || '未设置'}」变更为「${startDate || '已清除'}」`,
        },
      })

      void triggerSyncIfNeeded(id)
      return NextResponse.json({ record: updated })
    }

    // 单独更新离职日期（内联编辑，前端二次确认后调用）
    if (onlyField(resignedAt)) {
      const oldDate = record.resignedAt
      const updated = await prisma.followUpRecord.update({
        where: { id },
        data: { resignedAt: resignedAt ? new Date(resignedAt) : null },
      })

      await prisma.followUpLog.create({
        data: {
          followUpRecordId: id,
          action: 'RESIGN_DATE_CHANGE',
          detail: `离职日期从「${oldDate ? new Date(oldDate).toLocaleDateString('zh-CN') : '未设置'}」变更为「${resignedAt ? new Date(resignedAt).toLocaleDateString('zh-CN') : '已清除'}」`,
        },
      })

      return NextResponse.json({ record: updated })
    }

    // 单独更新联系结果
    if (onlyField(contacted)) {
      const oldContacted = record.contacted || 'NOT_CONTACTED'
      const updated = await prisma.followUpRecord.update({
        where: { id },
        data: { contacted },
      })

      await prisma.followUpLog.create({
        data: {
          followUpRecordId: id,
          action: 'CONTACT_RESULT_CHANGE',
          detail: `联系结果从「${contactResultLabel(oldContacted)}」变更为「${contactResultLabel(contacted)}」`,
        },
      })

      void triggerSyncIfNeeded(id)
      return NextResponse.json({ record: updated })
    }

    // 单独更新拒绝原因（不需要状态变更；取消面试场景 reasonLabel 为「取消原因」）
    if (onlyField(rejectReason)) {
      const reasonLabel = typeof body.reasonLabel === 'string' && body.reasonLabel ? body.reasonLabel : '拒绝原因'
      const action = reasonLabel === '取消原因' ? 'CANCEL_REASON_CHANGE' : 'REJECT_REASON_CHANGE'
      const updated = await prisma.followUpRecord.update({
        where: { id },
        data: { rejectReason },
      })

      await prisma.followUpLog.create({
        data: {
          followUpRecordId: id,
          action,
          detail: rejectReason ? `${reasonLabel}更新: ${rejectReason}` : `${reasonLabel}已清空`,
        },
      })

      void triggerSyncIfNeeded(id)
      return NextResponse.json({ record: updated })
    }

    // 单独更新离职原因（不需要状态变更）
    if (onlyField(resignReason)) {
      const updated = await prisma.followUpRecord.update({
        where: { id },
        data: { resignReason },
      })

      await prisma.followUpLog.create({
        data: {
          followUpRecordId: id,
          action: 'RESIGN_REASON_CHANGE',
          detail: resignReason ? `离职原因更新: ${resignReason}` : '离职原因已清空',
        },
      })

      void triggerSyncIfNeeded(id)
      return NextResponse.json({ record: updated })
    }

    // 状态变更逻辑：校验流转合法性（正向流转 + 回退）
    const transition = validateTransition(record.status, status, body)
    if (!transition.valid) {
      return NextResponse.json({ error: transition.error || '无效的状态变更' }, { status: 400 })
    }

    // 构建更新数据（状态变更时刷新 statusChangedAt，作为列表排序依据）
    const data: Record<string, unknown> = { status, statusChangedAt: new Date() }
    if (interviewTime !== undefined) data.interviewTime = interviewTime
    if (startDate !== undefined) data.startDate = startDate
    if (rejectReason !== undefined) data.rejectReason = rejectReason
    if (resignedAt !== undefined) data.resignedAt = resignedAt
    if (resignReason !== undefined) data.resignReason = resignReason
    if (note !== undefined) data.note = note

    // 不合适时间：变为 UNSUITABLE 时写入，从 UNSUITABLE 回退时清空
    if (status === 'UNSUITABLE') {
      data.unsuitableAt = new Date()
    } else if (record.status === 'UNSUITABLE' && status !== 'UNSUITABLE') {
      data.unsuitableAt = null
    }

    // 从已入职回退时清空入职相关字段
    if (record.status === 'HIRED' && status !== 'HIRED') {
      data.startDate = null
      data.salaryRange = null
      data.jobLevel = null
    }

    // 离职日期：变为 RESIGNED 时写入
    if (status === 'RESIGNED') {
      data.resignedAt = resignedAt ? new Date(resignedAt) : new Date()
    }

    // 处理标签替换（如果在传参中提供了 tagIds）。旧标签的删除与重建在下方事务里与原状态更新一起原子完成。
    let tagChangeDetail = ''
    const hasTagIds = tagIds && Array.isArray(tagIds) && tagIds.length > 0
    if (hasTagIds) {
      const existingTags = await prisma.followUpRecordTag.findMany({
        where: { followUpRecordId: id },
        include: { followUpTag: true },
      })
      const oldTagNames = existingTags.map((t) => t.followUpTag.name)

      // 获取新标签名
      const newTags = await prisma.followUpTag.findMany({ where: { id: { in: tagIds } } })
      const newTagNames = newTags.map((t) => t.name)

      if (oldTagNames.length === 0 && newTagNames.length > 0) {
        tagChangeDetail = `\n标签: 新增「${newTagNames.join(', ')}」`
      } else if (newTagNames.length === 0 && oldTagNames.length > 0) {
        tagChangeDetail = `\n标签: 已清除`
      } else if (oldTagNames.join(',') !== newTagNames.join(',')) {
        tagChangeDetail = `\n标签: 从「${oldTagNames.join(', ')}」变更为「${newTagNames.join(', ')}」`
      }
    }

    // 决定日志 action：回退 → ROLLBACK，面试结束 → INTERVIEW_END，其他 → STATUS_CHANGE
    const oldStatus = record.status
    const logAction = transition.type === 'rollback'
      ? 'ROLLBACK'
      : status === 'INTERVIEWED'
        ? 'INTERVIEW_END'
        : 'STATUS_CHANGE'

    // 构建日志详情
    let detail = `状态变更: ${STATUS_CN[oldStatus] || oldStatus} → ${STATUS_CN[status] || status}`
    if (interviewTime) detail += `\n面试时间: ${fmtDatetime(interviewTime)}`
    if (rejectReason) {
      const reasonLabel = status === 'INTERVIEW_CANCELLED' ? '取消原因' : status === 'OFFER_REJECTED' ? '拒offer原因' : '不合适原因'
      detail += `\n${reasonLabel}: ${rejectReason}`
    }
    if (resignedAt) detail += `\n离职日期: ${resignedAt}`
    if (resignReason) detail += `\n离职原因: ${resignReason}`
    if (startDate) detail += `\n入职时间: ${fmtDatetime(startDate)}`
    if (tagChangeDetail) detail += tagChangeDetail
    if (rollbackReason) detail += `\n回退原因: ${rollbackReason}`
    if (note !== undefined && note !== record.note) {
      if (note) {
        detail += `\n备注: ${note.length > 100 ? note.slice(0, 100) + '…' : note}`
      } else {
        detail += `\n备注: 已清空`
      }
    }

    // 状态变更 + 标签替换 + 日志原子提交（A12：标签 deleteMany+create 与状态更新同事务，避免半完成状态）
    const updated = await prisma.$transaction(async (tx) => {
      if (hasTagIds) {
        await tx.followUpRecordTag.deleteMany({ where: { followUpRecordId: id } })
      }
      return tx.followUpRecord.update({
        where: { id },
        data: {
          ...data,
          ...(hasTagIds ? { tags: { create: tagIds.map((tagId: string) => ({ followUpTagId: tagId })) } } : {}),
          logs: {
            create: {
              action: logAction,
              detail,
              fromStatus: oldStatus,
              toStatus: status,
              transitionType: transition.type,
            },
          },
        },
      })
    })

    void triggerSyncIfNeeded(id, record.status)
    return NextResponse.json({ record: updated })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { tagIds } = body

    if (!tagIds || !Array.isArray(tagIds) || tagIds.length === 0) {
      return NextResponse.json({ error: '至少选择一个标签' }, { status: 400 })
    }

    const record = await prisma.followUpRecord.findUnique({
      where: { id },
      include: { tags: { include: { followUpTag: true } } },
    })
    if (!record) {
      return NextResponse.json({ error: '跟进记录不存在' }, { status: 404 })
    }

    const oldTagNames = record.tags.map((t) => t.followUpTag.name)

    // 事务包裹标签替换（deleteMany + create 原子性，崩溃不留半替换状态）与日志
    await prisma.$transaction(async (tx) => {
      await tx.followUpRecordTag.deleteMany({ where: { followUpRecordId: id } })
      await tx.followUpRecord.update({
        where: { id },
        data: {
          tags: {
            create: tagIds.map((tagId: string) => ({ followUpTagId: tagId })),
          },
        },
      })

      // Fetch new tag names for log
      const newTags = await tx.followUpTag.findMany({ where: { id: { in: tagIds } } })
      const newTagNames = newTags.map((t) => t.name)

      await tx.followUpLog.create({
        data: {
          followUpRecordId: id,
          action: 'TAG_CHANGE',
          detail: `标签从「${oldTagNames.join(', ')}」变更为「${newTagNames.join(', ')}」`,
        },
      })
    })

    const updated = await prisma.followUpRecord.findUnique({
      where: { id },
      include: { tags: { include: { followUpTag: true } } },
    })

    return NextResponse.json({ record: updated })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const record = await prisma.followUpRecord.findUnique({ where: { id } })
    if (!record) {
      return NextResponse.json({ error: '跟进记录不存在' }, { status: 404 })
    }

    await prisma.followUpRecord.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}