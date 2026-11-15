import { NextResponse } from 'next/server'
import { apiFail } from '@/lib/services/auth-http'
import { getSessionUser, toPublicHrUser } from '@/lib/services/auth-store'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return apiFail('登录状态已失效，请重新登录', 401)
  return NextResponse.json({ user: toPublicHrUser(user) })
}
