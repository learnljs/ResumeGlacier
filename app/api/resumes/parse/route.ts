import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/services/api-error'
import { resumeParsingQueue } from '@/lib/services/resume-parsing-queue'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { resumeId, autoExtract } = body as { resumeId: string; autoExtract?: boolean }
    if (!resumeId) {
      return NextResponse.json({ error: '请提供简历ID' }, { status: 400 })
    }
    const enqueued = await resumeParsingQueue.enqueue([resumeId], {
      autoExtract: autoExtract === true,
    })
    return NextResponse.json({ success: true, queued: enqueued })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
