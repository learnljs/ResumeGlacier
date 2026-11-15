import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiFail, attachSession, readJsonBody } from '@/lib/services/auth-http'
import { toPublicHrUser } from '@/lib/services/auth-store'
import {
  hashPassword,
  hasSessionSecret,
  isValidPhone,
  normalizePhone,
  safeStringEqual,
  validatePassword,
} from '@/lib/services/auth-token'

/**
 * 冷启动初始化：仅当人员表为空时可用。
 * 必须提供 .env 中的 SETUP_CODE，避免同一 WiFi 的人抢先注册成管理员。
 */
export async function POST(request: NextRequest) {
  if (!hasSessionSecret()) {
    return apiFail('服务器缺少 SESSION_SECRET / ENCRYPTION_KEY 配置，请检查 .env', 503)
  }

  const configuredCode = process.env.SETUP_CODE?.trim()
  if (!configuredCode) {
    return apiFail('尚未配置 SETUP_CODE，请先在 .env 中设置后重启服务', 503)
  }

  if ((await prisma.hrUser.count()) > 0) {
    return apiFail('系统已完成初始化，请直接登录', 409)
  }

  const body = await readJsonBody(request)
  if (!body) return apiFail('请求格式不正确')

  const code = typeof body.code === 'string' ? body.code.trim() : ''
  if (!safeStringEqual(code, configuredCode)) {
    return apiFail('初始化码不正确', 403)
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const phone = normalizePhone(body.phone)
  const password = body.password

  if (!name || name.length > 40) return apiFail('请填写姓名（不超过 40 字）')
  if (!isValidPhone(phone)) return apiFail('请填写有效的手机号（6-20 位数字）')
  const passwordError = validatePassword(password)
  if (passwordError) return apiFail(passwordError)

  const { hash, salt } = hashPassword(password as string)

  try {
    const user = await prisma.hrUser.create({
      data: {
        name,
        phone,
        passwordHash: hash,
        passwordSalt: salt,
        role: 'ADMIN',
        enabled: true,
        lastLoginAt: new Date(),
      },
    })
    return attachSession(
      NextResponse.json({ ok: true, user: toPublicHrUser(user) }),
      user,
      request
    )
  } catch (error) {
    // 两个请求同时初始化时，手机号唯一约束会挡住后者
    if ((error as { code?: string })?.code === 'P2002') {
      return apiFail('系统已完成初始化，请直接登录', 409)
    }
    console.error('[auth/setup]', error)
    return apiFail('初始化失败，请稍后重试', 500)
  }
}
