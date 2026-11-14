import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/services/api-error'
import { ensureDemoSeeded, exitDemoMode, getDemoStatus } from '@/lib/services/demo-mode'

/** 并发请求只播种一次，避免首屏几个组件同时触发导致重复写入 */
let seeding: Promise<boolean> | null = null

export async function GET() {
  try {
    if (!seeding) {
      seeding = ensureDemoSeeded().catch((error) => {
        seeding = null
        throw error
      })
    }
    await seeding
    seeding = null

    const status = await getDemoStatus()
    return NextResponse.json(status)
  } catch (error: unknown) {
    return apiErrorResponse(error, '演示状态获取失败')
  }
}

/** 退出演示模式：清空演示数据，之后用户自己去配置邮箱 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    if (body?.action !== 'reset') {
      return NextResponse.json({ error: '不支持的操作' }, { status: 400 })
    }

    await exitDemoMode()
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    return apiErrorResponse(error, '退出演示模式失败')
  }
}
