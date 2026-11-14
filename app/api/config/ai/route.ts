import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { encrypt } from '@/lib/services/encryption'

export async function GET() {
  try {
    const configs = await prisma.aIConfig.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      include: {
        _count: { select: { evaluations: true } },
      },
    })

    return NextResponse.json({
      configs: configs.map((c) => ({
        id: c.id,
        alias: c.alias,
        provider: c.provider,
        baseUrl: c.baseUrl,
        model: c.model,
        purposes: c.purposes,
        isDefault: c.isDefault,
        isActive: c.isActive,
        hasApiKey: true,
        _count: c._count,
      })),
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { alias, provider, apiKey, baseUrl, model, purposes, isDefault } = body as {
      alias?: string
      provider: string
      apiKey: string
      baseUrl?: string
      model: string
      purposes?: string
      isDefault?: boolean
    }

    if (!apiKey) {
      return NextResponse.json({ error: '请填写 API Key' }, { status: 400 })
    }
    if (!model) {
      return NextResponse.json({ error: '请填写模型名称' }, { status: 400 })
    }

    const encryptedKey = encrypt(apiKey)

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.aIConfig.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      })
    }

    const config = await prisma.aIConfig.create({
      data: {
        alias: alias || `${provider || 'openai'} ${model}`,
        provider: provider || 'openai',
        apiKey: encryptedKey,
        baseUrl: baseUrl || null,
        model,
        purposes: purposes || 'screening',
        isDefault: isDefault ?? false,
        isActive: true,
      },
    })

    return NextResponse.json({
      success: true,
      config: {
        id: config.id,
        alias: config.alias,
        provider: config.provider,
        model: config.model,
        purposes: config.purposes,
        isDefault: config.isDefault,
      },
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
