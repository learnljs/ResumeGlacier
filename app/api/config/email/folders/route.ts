import { NextRequest, NextResponse } from 'next/server'
import { listImapFolders } from '@/lib/services/email-fetcher'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { host, port, secure, user, password } = body

    if (!host || !user || !password) {
      return NextResponse.json(
        { success: false, message: '请填写完整的连接信息（服务器、邮箱地址、密码）' },
        { status: 400 }
      )
    }

    const result = await listImapFolders({
      host,
      port: port || 993,
      secure: secure !== false,
      user,
      password,
    })

    if (!result.success) {
      return NextResponse.json(result, { status: 502 })
    }

    return NextResponse.json(result)
  } catch (error: unknown) {
    // B7-3 例外：连接测试接口的失败详情是诊断输出，需保留给 HR 排障
    const message = error instanceof Error ? error.message : '未知错误'
    return NextResponse.json(
      { success: false, message: `获取文件夹列表失败: ${message}` },
      { status: 500 }
    )
  }
}
