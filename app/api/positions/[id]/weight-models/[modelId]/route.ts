import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { WEIGHT_MODEL_CATEGORIES } from '@/lib/constants/evaluation'
import { autoCalculateScores } from '@/lib/services/evaluation-service'

/**
 * GET /api/positions/[id]/weight-models/[modelId]
 * 获取单个权重模型详情
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; modelId: string }> }
) {
  try {
    const { id, modelId } = await params

    const model = await prisma.weightModel.findUnique({
      where: { id: modelId },
    })

    if (!model) {
      return NextResponse.json({ error: '权重模型不存在' }, { status: 404 })
    }

    // 校验模型归属
    if (model.positionId !== id) {
      return NextResponse.json({ error: '该模型不属于此职位' }, { status: 403 })
    }

    return NextResponse.json({ model })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}

/**
 * PUT /api/positions/[id]/weight-models/[modelId]
 * 更新权重模型（名称、权重）
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; modelId: string }> }
) {
  try {
    const { id, modelId } = await params
    const body = await request.json()
    const { name, weights } = body

    // 校验模型存在
    const model = await prisma.weightModel.findUnique({
      where: { id: modelId },
      include: { position: true },
    })

    if (!model) {
      return NextResponse.json({ error: '权重模型不存在' }, { status: 404 })
    }

    // 校验模型归属
    if (model.positionId !== id) {
      return NextResponse.json({ error: '该模型不属于此职位' }, { status: 403 })
    }

    // 停用锁定校验
    if (model.position.status === 'disabled') {
      return NextResponse.json(
        { error: '该职位已停用，请先启用后再修改' },
        { status: 400 }
      )
    }

    // 权重总和校验
    if (weights) {
      const weightValues: number[] = Object.values(weights)
      const sum = weightValues.reduce((a, b) => a + b, 0)
      if (Math.abs(sum - 100) > 0.01) {
        return NextResponse.json(
          { error: `权重总和应为 100，当前为 ${sum}` },
          { status: 400 }
        )
      }
    }

    // 更新模型
    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (weights !== undefined) updateData.weights = JSON.stringify(weights)

    const updated = await prisma.weightModel.update({
      where: { id: modelId },
      data: updateData,
    })

    // 如果该模型是默认模型，重算该职位下所有简历得分
    const position = model.position
    if (
      position.defaultInitialModelId === modelId ||
      position.defaultIcebergModelId === modelId
    ) {
      const resumes = await prisma.resume.findMany({
        where: { positionId: id },
        select: { id: true },
      })
      for (const resume of resumes) {
        await autoCalculateScores(resume.id)
      }
    }

    return NextResponse.json({ model: updated })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}

/**
 * DELETE /api/positions/[id]/weight-models/[modelId]
 * 删除权重模型（被 Position 设为默认的不可删）
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; modelId: string }> }
) {
  try {
    const { id, modelId } = await params

    // 校验模型存在
    const model = await prisma.weightModel.findUnique({
      where: { id: modelId },
      include: { position: true },
    })

    if (!model) {
      return NextResponse.json({ error: '权重模型不存在' }, { status: 404 })
    }

    // 校验模型归属
    if (model.positionId !== id) {
      return NextResponse.json({ error: '该模型不属于此职位' }, { status: 403 })
    }

    // 停用锁定校验
    if (model.position.status === 'disabled') {
      return NextResponse.json(
        { error: '该职位已停用，请先启用后再修改' },
        { status: 400 }
      )
    }

    // 默认模型不可删
    const position = model.position
    if (
      position.defaultInitialModelId === modelId ||
      position.defaultIcebergModelId === modelId
    ) {
      return NextResponse.json(
        { error: '该模型是当前默认模型，请先切换默认模型后再删除' },
        { status: 400 }
      )
    }

    // 删除模型
    await prisma.weightModel.delete({ where: { id: modelId } })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
