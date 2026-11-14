import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const position = await prisma.position.findUnique({
      where: { id },
      include: {
        _count: { select: { resumes: true } },
        weightModels: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!position) {
      return NextResponse.json({ error: '职位不存在' }, { status: 404 })
    }

    return NextResponse.json({ position })
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
    const {
      title, department, description, requirements, keywords,
      status, defaultInitialModelId, defaultIcebergModelId,
    } = body

    // 校验职位存在
    const position = await prisma.position.findUnique({
      where: { id },
      include: { weightModels: true },
    })
    if (!position) {
      return NextResponse.json({ error: '职位不存在' }, { status: 404 })
    }

    // 停用锁定校验：停用状态下不允许修改基本信息
    if (position.status === 'disabled') {
      const hasBasicInfoChange =
        title !== undefined ||
        department !== undefined ||
        description !== undefined ||
        requirements !== undefined ||
        keywords !== undefined
      if (hasBasicInfoChange) {
        return NextResponse.json(
          { error: '该职位已停用，请先启用后再修改' },
          { status: 400 }
        )
      }
    }

    // 校验 status 切换逻辑
    if (status !== undefined) {
      if (status === 'disabled' && position.status === 'disabled') {
        return NextResponse.json({ error: '该职位已处于停用状态' }, { status: 400 })
      }
      if (status === 'active' && position.status !== 'disabled') {
        return NextResponse.json({ error: '该职位已处于启用状态' }, { status: 400 })
      }
      if (!['active', 'disabled'].includes(status)) {
        return NextResponse.json(
          { error: `无效的状态值: ${status}，应为 active 或 disabled` },
          { status: 400 }
        )
      }
    }

    // 设置默认初筛模型 — 归属 + 类别校验
    if (defaultInitialModelId !== undefined) {
      if (defaultInitialModelId !== null) {
        const model = await prisma.weightModel.findUnique({
          where: { id: defaultInitialModelId },
        })
        if (!model) {
          return NextResponse.json({ error: '指定的初筛模型不存在' }, { status: 400 })
        }
        if (model.positionId !== id) {
          return NextResponse.json({ error: '该模型不属于此职位' }, { status: 400 })
        }
        if (model.category !== 'initial') {
          return NextResponse.json({ error: '默认初筛模型必须是初筛（initial）类别' }, { status: 400 })
        }
      }
    }

    // 设置默认冰山模型 — 归属 + 类别校验
    if (defaultIcebergModelId !== undefined) {
      if (defaultIcebergModelId !== null) {
        const model = await prisma.weightModel.findUnique({
          where: { id: defaultIcebergModelId },
        })
        if (!model) {
          return NextResponse.json({ error: '指定的冰山模型不存在' }, { status: 400 })
        }
        if (model.positionId !== id) {
          return NextResponse.json({ error: '该模型不属于此职位' }, { status: 400 })
        }
        if (model.category !== 'iceberg') {
          return NextResponse.json({ error: '默认冰山模型必须是冰山（iceberg）类别' }, { status: 400 })
        }
      }
    }

    // 构建更新数据
    const updateData: Record<string, unknown> = {}
    if (title !== undefined) updateData.title = title
    if (department !== undefined) updateData.department = department
    if (description !== undefined) updateData.description = description
    if (requirements !== undefined) updateData.requirements = requirements
    if (keywords !== undefined) updateData.keywords = keywords
    if (status !== undefined) updateData.status = status
    if (defaultInitialModelId !== undefined) updateData.defaultInitialModelId = defaultInitialModelId
    if (defaultIcebergModelId !== undefined) updateData.defaultIcebergModelId = defaultIcebergModelId

    const updatedPosition = await prisma.position.update({
      where: { id },
      data: updateData,
      include: {
        _count: { select: { resumes: true } },
        weightModels: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    return NextResponse.json({ position: updatedPosition })
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

    const position = await prisma.position.findUnique({
      where: { id },
      include: {
        _count: { select: { resumes: true } },
      },
    })

    if (!position) {
      return NextResponse.json({ error: '职位不存在' }, { status: 404 })
    }

    // 有简历的职位不可删除（无论启用还是停用状态）
    if (position._count.resumes > 0) {
      return NextResponse.json(
        { error: `该职位存在 ${position._count.resumes} 条关联简历，不可删除` },
        { status: 400 }
      )
    }

    // 物理删除（级联删除关联的权重模型）
    // 先删除该职位下的所有权重模型
    await prisma.weightModel.deleteMany({ where: { positionId: id } })
    // 再删除职位
    await prisma.position.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
