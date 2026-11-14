import { NextRequest, NextResponse } from 'next/server'
import { parseIntParam } from '@/lib/utils'
import { apiErrorResponse } from '@/lib/services/api-error'
import { getBatchDetail, getBatchResumes, deleteBatch, stopBatch } from '@/lib/services/task-batch-service'

// GET /api/task-batches/[id] - 获取批次详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const includeResumes = searchParams.get('includeResumes') === 'true'
    const resumePage = parseIntParam(searchParams.get('resumePage'), 1, { min: 1 })
    const resumePageSize = parseIntParam(searchParams.get('resumePageSize'), 20, { min: 1, max: 100 })
    const resumeStatus = searchParams.get('resumeStatus') || undefined

    if (includeResumes) {
      // 获取批次详情含简历列表
      const batch = await getBatchDetail(id)
      if (!batch) {
        return NextResponse.json({ error: '批次不存在' }, { status: 404 })
      }

      // 支持分页获取简历
      const { resumes, total } = await getBatchResumes(id, resumePage, resumePageSize, resumeStatus)

      return NextResponse.json({
        batch: {
          ...batch,
          resumes,
          resumesPagination: {
            page: resumePage,
            pageSize: resumePageSize,
            total,
            totalPages: Math.ceil(total / resumePageSize),
          },
        },
      })
    } else {
      // 只获取批次信息，不含简历
      const batch = await getBatchDetail(id)
      if (!batch) {
        return NextResponse.json({ error: '批次不存在' }, { status: 404 })
      }

      return NextResponse.json({ batch })
    }
  } catch (error) {
    console.error('获取批次详情失败:', error)
    return NextResponse.json({ error: '获取批次详情失败' }, { status: 500 })
  }
}

// DELETE /api/task-batches/[id] - 删除批次
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await deleteBatch(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除批次失败:', error)
    return apiErrorResponse(error, '删除批次失败')
  }
}

// POST /api/task-batches/[id] - 停止批次
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const { action } = body as { action?: string }

    if (action === 'stop') {
      await stopBatch(id)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 })
  } catch (error) {
    console.error('停止批次失败:', error)
    return apiErrorResponse(error, '停止批次失败')
  }
}
