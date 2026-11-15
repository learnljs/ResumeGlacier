import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiFail, attachSession, readJsonBody } from '@/lib/services/auth-http'
import { toPublicHrUser } from '@/lib/services/auth-store'
import { hasSessionSecret, isValidPhone, normalizePhone, verifyPassword } from '@/lib/services/auth-token'

/** 登录：手机号必须在预登记名单中且状态启用，再核对本人密码 */
export async function POST(request: NextRequest) {
  if (!hasSessionSecret()) {
    return apiFail('服务器缺少 SESSION_SECRET / ENCRYPTION_KEY 配置，请检查 .env', 503)
  }

  const body = await readJsonBody(request)
  if (!body) return apiFail('请求格式不正确')

  const phone = normalizePhone(body.phone)
  const password = typeof body.password === 'string' ? body.password : ''
  // 统一错误文案，不区分「号码不存在 / 已停用 / 密码错」，避免账号枚举
  const failed = apiFail('手机号或密码不正确', 401)

  if (!isValidPhone(phone) || !password) return failed

  const user = await prisma.hrUser.findUnique({ where: { phone } })
  if (!user || !user.enabled) return failed
  if (!verifyPassword(password, user.passwordHash, user.passwordSalt)) return failed

  const updated = await prisma.hrUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  return attachSession(
    NextResponse.json({ ok: true, user: toPublicHrUser(updated) }),
    updated,
    request
  )
}
