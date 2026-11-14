import { NextRequest, NextResponse } from 'next/server'
import { parseIntParam } from '@/lib/utils'
import { getRecentBatches, createBatch } from '@/lib/services/task-batch-service'

// GET /api/task-batches - 获取批次列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseIntParam(searchParams.get('limit'), 10, { min: 1, max: 100 })

    const batches = await getRecentBatches(limit)

    return NextResponse.json({ batches })
  } catch (error) {
    console.error('获取批次列表失败:', error)
    return NextResponse.json({ error: '获取批次列表失败' }, { status: 500 })
  }
}

// POST /api/task-batches - 创建新批次
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { source, sourceDetail, emailConfigId, resumeIds } = body

    if (!source || !resumeIds || !Array.isArray(resumeIds)) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 })
    }

    const batch = await createBatch({
      source,
      sourceDetail,
      emailConfigId,
      resumeIds,
    })

    return NextResponse.json({ batch })
  } catch (error) {
    console.error('创建批次失败:', error)
    return NextResponse.json({ error: '创建批次失败' }, { status: 500 })
  }
}
