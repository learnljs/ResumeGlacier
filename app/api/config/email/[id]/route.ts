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
    const config = await prisma.emailConfig.findUnique({
      where: { id },
      include: {
        resumeSource: { select: { id: true, name: true } },
      },
    })

    if (!config) {
      return NextResponse.json({ error: '邮箱配置不存在' }, { status: 404 })
    }

    return NextResponse.json({
      config: {
        id: config.id,
        alias: config.alias,
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: config.user,
        password: '********',
        mailbox: config.mailbox,
        resumeSourceId: config.resumeSourceId,
        resumeSource: config.resumeSource,
        lastFetchedAt: config.lastFetchedAt,
        isActive: config.isActive,
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
    const { alias, host, port, secure, user, password, mailbox, resumeSourceId, isActive } = body

    const existing = await prisma.emailConfig.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '邮箱配置不存在' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (alias !== undefined) data.alias = alias
    if (host !== undefined) data.host = host
    if (port !== undefined) data.port = port
    if (secure !== undefined) data.secure = secure
    if (user !== undefined) data.user = user
    if (password && password !== '********') data.password = encrypt(password)
    if (mailbox !== undefined) data.mailbox = mailbox
    if (resumeSourceId !== undefined) data.resumeSourceId = resumeSourceId || null
    if (isActive !== undefined) data.isActive = isActive

    const config = await prisma.emailConfig.update({
      where: { id },
      data,
    })

    return NextResponse.json({
      success: true,
      config: {
        id: config.id,
        alias: config.alias,
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: config.user,
        mailbox: config.mailbox,
        resumeSourceId: config.resumeSourceId,
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

    const emailCount = await prisma.email.count({
      where: { emailConfigId: id },
    })
    if (emailCount > 0) {
      return NextResponse.json(
        { error: `该邮箱已关联 ${emailCount} 封邮件，无法删除` },
        { status: 400 }
      )
    }

    await prisma.emailConfig.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
