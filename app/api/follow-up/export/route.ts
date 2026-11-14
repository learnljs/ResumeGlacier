import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { buildFollowUpWhere } from '@/lib/services/follow-up-service'
import { formatDateTime } from '@/lib/utils/date'
import { contactResultLabel } from '@/lib/constants/contact-result'
import { EXPORT_FIELDS, EXPORT_FIELD_KEYS, EXPORT_FIELD_LABELS } from '@/lib/constants/export-fields'

export async function GET() {
  return NextResponse.json({ fields: EXPORT_FIELDS })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fields, tagIds, tagLogic, search, positionIds, recordStatus, dateFrom, dateTo, contacted } = body
    const selectedFields: string[] = fields && fields.length > 0 ? fields : EXPORT_FIELD_KEYS

    // Build where clause（复用 records GET 的共享逻辑 B7-6；数组或逗号串统一为逗号串）
    const toCsv = (v: unknown) => (Array.isArray(v) ? v.join(',') : typeof v === 'string' ? v : '')
    const { where } = buildFollowUpWhere({
      recordStatus,
      contacted: toCsv(contacted),
      search,
      positionIds: toCsv(positionIds),
      dateFrom,
      dateTo,
      tagIds: toCsv(tagIds),
      tagLogic,
    })

    const records = await prisma.followUpRecord.findMany({
      where,
      include: {
        tags: { include: { followUpTag: true } },
        evaluation: {
          select: { initialScore: true, compositeScore: true },
        },
        resume: {
          include: {
            position: { select: { title: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Build CSV
    const fieldMap = EXPORT_FIELD_LABELS
    const headers = selectedFields.map((k) => fieldMap[k] || k)

    const rows = records.map((record) => {
      return selectedFields.map((key) => {
        switch (key) {
          case 'candidateName': return record.resume.candidateName || ''
          case 'candidatePhone': return record.resume.candidatePhone || ''
          case 'rejectReason': return record.rejectReason || ''
          case 'initialScore': return record.evaluation?.initialScore != null ? String(record.evaluation.initialScore) : ''
          case 'compositeScore': return record.evaluation?.compositeScore != null ? String(record.evaluation.compositeScore) : ''
          case 'interviewTime': return record.interviewTime ? record.interviewTime.replace('T', ' ') : ''
          case 'unsuitableAt': return record.unsuitableAt ? formatDateTime(record.unsuitableAt) : ''
          case 'tags': return record.tags.map((t) => t.followUpTag.name).join('、')
          case 'note': return record.note || ''
          case 'contacted': return contactResultLabel(record.contacted)
          case 'position': return record.resume.position?.title || ''
          case 'receivedAt': return record.resume.sourceEmailReceivedAt
            ? formatDateTime(record.resume.sourceEmailReceivedAt)
            : ''
          case 'followUpCreatedAt': return formatDateTime(record.createdAt)
          default: return ''
        }
      })
    })

    // Escape CSV
    const escapeCsv = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`
      }
      return val
    }

    const csvContent = [
      headers.map(escapeCsv).join(','),
      ...rows.map((row) => row.map(escapeCsv).join(',')),
    ].join('\n')

    // Add BOM for Excel compatibility
    const bom = '﻿'

    return new NextResponse(bom + csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="follow-up-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
