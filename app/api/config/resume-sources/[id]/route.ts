import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const source = await prisma.resumeSource.findUnique({
      where: { id },
      include: {
        emailConfigs: {
          select: { id: true, alias: true, user: true },
        },
        _count: { select: { resumes: true } },
      },
    })

    if (!source) {
      return NextResponse.json({ error: '简历来源不存在' }, { status: 404 })
    }

    return NextResponse.json({ source })
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
    const { name, description, promptTemplate, subjectPattern, isActive } = body as {
      name?: string
      description?: string
      promptTemplate?: string
      subjectPattern?: string
      isActive?: boolean
    }

    const existing = await prisma.resumeSource.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '简历来源不存在' }, { status: 404 })
    }

    if (name && name.trim() !== existing.name) {
      const duplicate = await prisma.resumeSource.findUnique({
        where: { name: name.trim() },
      })
      if (duplicate) {
        return NextResponse.json({ error: '来源名称已存在' }, { status: 400 })
      }
    }

    const source = await prisma.resumeSource.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(promptTemplate !== undefined && { promptTemplate: promptTemplate?.trim() || null }),
        ...(subjectPattern !== undefined && { subjectPattern: subjectPattern?.trim() || null }),
        ...(isActive !== undefined && { isActive }),
      },
    })

    return NextResponse.json({ success: true, source })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const resumeCount = await prisma.resume.count({
      where: { resumeSourceId: id },
    })
    if (resumeCount > 0) {
      return NextResponse.json(
        { error: `该来源关联了 ${resumeCount} 份简历，无法删除。请先取消关联。` },
        { status: 400 }
      )
    }

    await prisma.resumeSource.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
