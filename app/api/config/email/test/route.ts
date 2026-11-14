import { NextRequest, NextResponse } from 'next/server'
import { testImapConnection } from '@/lib/services/email-fetcher'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { host, port, secure, user, password } = body

    if (!host || !user || !password) {
      return NextResponse.json(
        { error: '请填写完整的连接信息' },
        { status: 400 }
      )
    }

    const result = await testImapConnection({
      host,
      port: port || 993,
      secure: secure !== false,
      user,
      password,
    })

    return NextResponse.json(result)
  } catch (error: unknown) {
    // B7-3 例外：连接测试接口的失败详情（如 connect ECONNREFUSED）是诊断输出，需保留给 HR 排障
    const message = error instanceof Error ? error.message : '未知错误'
    return NextResponse.json(
      { success: false, message: `测试失败: ${message}` },
      { status: 500 }
    )
  }
}
