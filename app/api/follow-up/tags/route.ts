import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'

export async function GET() {
  try {
    const tags = await prisma.followUpTag.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { records: true } },
      },
    })
    return NextResponse.json({ tags })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, color, source, category } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: '标签名称不能为空' }, { status: 400 })
    }

    const VALID_CATEGORIES = ['hard', 'intent', 'custom']
    if (category && !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: '无效的标签分类' }, { status: 400 })
    }

    const existing = await prisma.followUpTag.findUnique({ where: { name: name.trim() } })
    if (existing) {
      return NextResponse.json({ error: '标签名称已存在' }, { status: 400 })
    }

    const tag = await prisma.followUpTag.create({
      data: {
        name: name.trim(),
        color: color || '#3b82f6',
        source: source || 'manual',
        category: category || 'custom',
      },
    })
    return NextResponse.json({ tag })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, name, color } = body

    if (!id) return NextResponse.json({ error: '标签ID不能为空' }, { status: 400 })
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: '标签名称不能为空' }, { status: 400 })
    }

    const existing = await prisma.followUpTag.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: '标签不存在' }, { status: 404 })
    if (existing.source === 'ai') {
      return NextResponse.json({ error: 'AI 标签不支持手动编辑' }, { status: 400 })
    }

    const tag = await prisma.followUpTag.update({
      where: { id },
      data: { name: name.trim(), color: color || existing.color },
    })
    return NextResponse.json({ tag })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: '标签ID不能为空' }, { status: 400 })

    const existing = await prisma.followUpTag.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: '标签不存在' }, { status: 404 })
    if (existing.source === 'ai') {
      return NextResponse.json({ error: 'AI 标签不支持手动删除' }, { status: 400 })
    }

    await prisma.followUpTag.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
