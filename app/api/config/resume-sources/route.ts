import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'

export async function GET() {
  try {
    const sources = await prisma.resumeSource.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { emailConfigs: true, resumes: true },
        },
      },
    })

    return NextResponse.json({ sources })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, promptTemplate, subjectPattern } = body as {
      name: string
      description?: string
      promptTemplate?: string
      subjectPattern?: string
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: '请填写来源名称' }, { status: 400 })
    }

    const existing = await prisma.resumeSource.findUnique({
      where: { name: name.trim() },
    })
    if (existing) {
      return NextResponse.json({ error: '来源名称已存在' }, { status: 400 })
    }

    const source = await prisma.resumeSource.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        promptTemplate: promptTemplate?.trim() || null,
        subjectPattern: subjectPattern?.trim() || null,
      },
    })

    return NextResponse.json({ success: true, source })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
