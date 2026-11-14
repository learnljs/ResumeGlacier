import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { positionId } = body

    if (!positionId) {
      return NextResponse.json(
        { error: '请指定职位ID' },
        { status: 400 }
      )
    }

    const existing = await prisma.resume.findUnique({ where: { id }, select: { status: true } })
    if (!existing) {
      return NextResponse.json({ error: '简历不存在' }, { status: 404 })
    }

    // 分配职位
    const data: Record<string, unknown> = { positionId }

    const resume = await prisma.resume.update({
      where: { id },
      data,
      include: { position: true },
    })

    return NextResponse.json({ resume })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
