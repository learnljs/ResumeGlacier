import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { encrypt, decrypt } from '@/lib/services/encryption'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const config = await prisma.aIConfig.findUnique({ where: { id } })

    if (!config) {
      return NextResponse.json({ error: 'AI配置不存在' }, { status: 404 })
    }

    return NextResponse.json({
      config: {
        id: config.id,
        alias: config.alias,
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.model,
        purposes: config.purposes,
        isDefault: config.isDefault,
        isActive: config.isActive,
        hasApiKey: true,
      },
    })
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
    const { alias, provider, apiKey, baseUrl, model, purposes, isDefault, isActive } = body

    const existing = await prisma.aIConfig.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'AI配置不存在' }, { status: 404 })
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.aIConfig.updateMany({
        where: { id: { not: id }, isDefault: true },
        data: { isDefault: false },
      })
    }

    const data: Record<string, unknown> = {}
    if (alias !== undefined) data.alias = alias
    if (provider !== undefined) data.provider = provider
    if (apiKey && apiKey !== '********') data.apiKey = encrypt(apiKey)
    if (baseUrl !== undefined) data.baseUrl = baseUrl || null
    if (model !== undefined) data.model = model
    if (purposes !== undefined) data.purposes = purposes
    if (isDefault !== undefined) data.isDefault = isDefault
    if (isActive !== undefined) data.isActive = isActive

    const config = await prisma.aIConfig.update({
      where: { id },
      data,
    })

    return NextResponse.json({
      success: true,
      config: {
        id: config.id,
        alias: config.alias,
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.model,
        purposes: config.purposes,
        isDefault: config.isDefault,
        isActive: config.isActive,
      },
    })
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

    const resultCount = await prisma.positionEvaluation.count({
      where: { aiConfigId: id },
    })
    if (resultCount > 0) {
      return NextResponse.json(
        { error: `该模型已关联 ${resultCount} 条筛选结果，无法删除` },
        { status: 400 }
      )
    }

    await prisma.aIConfig.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
