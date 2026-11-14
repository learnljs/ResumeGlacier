import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { encrypt } from '@/lib/services/encryption'

export async function GET() {
  try {
    const configs = await prisma.emailConfig.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        resumeSource: { select: { id: true, name: true } },
        _count: { select: { emails: true, resumes: true } },
      },
    })

    return NextResponse.json({
      configs: configs.map((c) => ({
        id: c.id,
        alias: c.alias,
        host: c.host,
        port: c.port,
        secure: c.secure,
        user: c.user,
        password: '********',
        mailbox: c.mailbox,
        resumeSourceId: c.resumeSourceId,
        resumeSource: c.resumeSource,
        lastFetchedAt: c.lastFetchedAt,
        isActive: c.isActive,
        _count: c._count,
      })),
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { alias, host, port, secure, user, password, mailbox, resumeSourceId } = body

    if (!user || !password) {
      return NextResponse.json(
        { error: '请填写邮箱账号和密码' },
        { status: 400 }
      )
    }

    const encryptedPassword = encrypt(password)

    const config = await prisma.emailConfig.create({
      data: {
        alias: alias || user,
        host: host || '',
        port: port || 993,
        secure: secure !== false,
        user,
        password: encryptedPassword,
        mailbox: mailbox || 'INBOX',
        resumeSourceId: resumeSourceId || null,
        isActive: true,
      },
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
      },
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '未知错误')
  }
}
