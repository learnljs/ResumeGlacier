import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiFail, attachSession, readJsonBody } from '@/lib/services/auth-http'
import { getSessionUser } from '@/lib/services/auth-store'
import { hashPassword, validatePassword, verifyPassword } from '@/lib/services/auth-token'

/** 修改自己的密码；改完给当前会话重签，避免自己被立刻踢出 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiFail('登录状态已失效，请重新登录', 401)

  const body = await readJsonBody(request)
  if (!body) return apiFail('请求格式不正确')

  const oldPassword = typeof body.oldPassword === 'string' ? body.oldPassword : ''
  const newPassword = body.newPassword
  if (!verifyPassword(oldPassword, user.passwordHash, user.passwordSalt)) {
    return apiFail('原密码不正确', 403)
  }
  const passwordError = validatePassword(newPassword)
  if (passwordError) return apiFail(passwordError)
  if (oldPassword === newPassword) return apiFail('新密码不能与原密码相同')

  const { hash, salt } = hashPassword(newPassword as string)
  const updated = await prisma.hrUser.update({
    where: { id: user.id },
    data: { passwordHash: hash, passwordSalt: salt },
  })

  // 密码指纹变化会让其他设备上的旧会话立即失效
  return attachSession(NextResponse.json({ ok: true }), updated, request)
}
