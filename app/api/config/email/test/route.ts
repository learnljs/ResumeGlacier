import { NextRequest, NextResponse } from 'next/server'
import { testImapConnection } from '@/lib/services/email-fetcher'

/**
 * POST /api/config/email/test
 *
 * 真的连一次 IMAP 服务器：建立连接 → 认证 → 读取文件夹列表 → 断开。
 * 任何一步失败都返回非 2xx 且 success=false，绝不把失败包装成「成功」。
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, message: '请求格式错误，请重新填写后重试' },
      { status: 400 },
    )
  }

  const { host, port, secure, user, password } = body
  if (
    typeof host !== 'string' || !host.trim() ||
    typeof user !== 'string' || !user.trim() ||
    typeof password !== 'string' || !password
  ) {
    return NextResponse.json(
      { success: false, message: '请填写完整的连接信息（服务器、邮箱地址、密码）' },
      { status: 400 },
    )
  }

  const portNumber = typeof port === 'number' ? port : Number(port) || 993
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    return NextResponse.json(
      { success: false, message: '端口需为 1–65535 之间的整数' },
      { status: 400 },
    )
  }

  try {
    const result = await testImapConnection({
      host: host.trim(),
      port: portNumber,
      secure: secure !== false,
      user: user.trim(),
      password,
    })

    return NextResponse.json(result, { status: result.success ? 200 : 502 })
  } catch (error: unknown) {
    // 连接测试接口的失败详情（如 connect ECONNREFUSED）是诊断输出，需保留给 HR 排障
    const message = error instanceof Error ? error.message : '未知错误'
    return NextResponse.json(
      { success: false, message: `测试失败: ${message}` },
      { status: 502 },
    )
  }
}
