import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { WEIGHT_MODEL_CATEGORIES } from '@/lib/constants/evaluation'

/**
 * GET /api/positions/[id]/weight-models
 * 获取该职位的权重模型列表，可选 ?category=initial|iceberg
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')

    // 校验职位存在
    const position = await prisma.position.findUnique({ where: { id } })
    if (!position) {
      return NextResponse.json({ error: '职位不存在' }, { status: 404 })
    }

    // 校验 category 参数
    if (category && !WEIGHT_MODEL_CATEGORIES.includes(category as typeof WEIGHT_MODEL_CATEGORIES[number])) {
      return NextResponse.json(
        { error: `无效的模型分类: ${category}，应为 initial 或 iceberg` },
        { status: 400 }
      )
    }

    const where: Record<string, string> = { positionId: id }
    if (category) {
      where.category = category
    }

    const models = await prisma.weightModel.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      models,
      defaults: {
        initialModelId: position.defaultInitialModelId,
        icebergModelId: position.defaultIcebergModelId,
      },
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}

/**
 * POST /api/positions/[id]/weight-models
 * 为该职位创建新权重模型
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, category, weights } = body

    // 校验职位存在
    const position = await prisma.position.findUnique({ where: { id } })
    if (!position) {
      return NextResponse.json({ error: '职位不存在' }, { status: 404 })
    }

    // 停用锁定校验
    if (position.status === 'disabled') {
      return NextResponse.json(
        { error: '该职位已停用，请先启用后再修改' },
        { status: 400 }
      )
    }

    // 参数校验
    if (!name || !category || !weights) {
      return NextResponse.json(
        { error: '模型名称、分类和权重为必填项' },
        { status: 400 }
      )
    }

    if (!WEIGHT_MODEL_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `无效的模型分类: ${category}，应为 initial 或 iceberg` },
        { status: 400 }
      )
    }

    // 权重总和校验
    const weightValues: number[] = Object.values(weights)
    const sum = weightValues.reduce((a, b) => a + b, 0)
    if (Math.abs(sum - 100) > 0.01) {
      return NextResponse.json(
        { error: `权重总和应为 100，当前为 ${sum}` },
        { status: 400 }
      )
    }

    // 一个职位每个分类只保留一份模型：初筛模型、冰山模型各一个
    const existing = await prisma.weightModel.findFirst({
      where: { positionId: id, category },
      select: { name: true },
    })
    if (existing) {
      return NextResponse.json(
        {
          error: `该职位的${category === 'initial' ? '初筛' : '冰山'}权重模型已存在，请直接修改它的权重`,
        },
        { status: 409 }
      )
    }

    // 创建模型
    const model = await prisma.weightModel.create({
      data: {
        name,
        category,
        weights: JSON.stringify(weights),
        positionId: id,
      },
    })

    // 唯一模型即默认模型，回写职位指针，保证历史职位（默认模型为空）也能正常评分
    await prisma.position.update({
      where: { id },
      data:
        category === 'initial'
          ? { defaultInitialModelId: model.id }
          : { defaultIcebergModelId: model.id },
    })

    return NextResponse.json({ model }, { status: 201 })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
