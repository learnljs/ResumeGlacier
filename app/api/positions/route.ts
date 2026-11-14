import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { DEFAULT_WEIGHT_MODEL_TEMPLATES } from '@/lib/constants/evaluation'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    // 支持 ?status=disabled 查询已停用职位，默认查询 active
    const where: Record<string, string> = {}
    if (status === 'disabled') {
      where.status = 'disabled'
    } else {
      where.status = 'active'
    }

    const positions = await prisma.position.findMany({
      where,
      include: {
        _count: { select: { resumes: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ positions })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, department, description, requirements, keywords } = body

    if (!title || !requirements) {
      return NextResponse.json(
        { error: '职位名称和筛选要求为必填项' },
        { status: 400 }
      )
    }

    // 职位创建 + 2 份权重模型初始化 + 回写默认模型，用事务保证原子性（A12：中途失败不留半成品职位）
    const created = await prisma.$transaction(async (tx) => {
      const position = await tx.position.create({
        data: {
          title,
          department: department || null,
          description: description || '',
          requirements,
          keywords: keywords || null,
          status: 'active',
        },
      })

      // 自动以模板初始化两份权重模型
      const initialTemplate = DEFAULT_WEIGHT_MODEL_TEMPLATES.initial
      const initialModel = await tx.weightModel.create({
        data: {
          name: initialTemplate.name,
          category: 'initial',
          weights: JSON.stringify(initialTemplate.weights),
          positionId: position.id,
        },
      })

      const icebergTemplate = DEFAULT_WEIGHT_MODEL_TEMPLATES.iceberg
      const icebergModel = await tx.weightModel.create({
        data: {
          name: icebergTemplate.name,
          category: 'iceberg',
          weights: JSON.stringify(icebergTemplate.weights),
          positionId: position.id,
        },
      })

      // 设置默认模型
      return tx.position.update({
        where: { id: position.id },
        data: {
          defaultInitialModelId: initialModel.id,
          defaultIcebergModelId: icebergModel.id,
        },
        include: {
          _count: { select: { resumes: true } },
        },
      })
    })

    return NextResponse.json({ position: created }, { status: 201 })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
