import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiFail, readJsonBody } from '@/lib/services/auth-http'
import { getSessionUser, toPublicHrUser } from '@/lib/services/auth-store'
import { hashPassword, isValidPhone, normalizePhone, validatePassword } from '@/lib/services/auth-token'

/** 人员名单：仅管理员可查看与登记 */
export async function GET() {
  const current = await getSessionUser()
  if (!current) return apiFail('登录状态已失效，请重新登录', 401)
  if (current.role !== 'ADMIN') return apiFail('仅管理员可管理人员名单', 403)

  const users = await prisma.hrUser.findMany({ orderBy: { createdAt: 'asc' } })
  return NextResponse.json({
    users: users.map(toPublicHrUser),
    currentUser: toPublicHrUser(current),
  })
}

/** 登记新 HR：管理员预置手机号与初始密码，本人登录后自行修改 */
export async function POST(request: NextRequest) {
  const current = await getSessionUser()
  if (!current) return apiFail('登录状态已失效，请重新登录', 401)
  if (current.role !== 'ADMIN') return apiFail('仅管理员可登记人员', 403)

  const body = await readJsonBody(request)
  if (!body) return apiFail('请求格式不正确')

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const phone = normalizePhone(body.phone)
  const password = body.password
  const role = body.role === 'ADMIN' ? 'ADMIN' : 'STAFF'

  if (!name || name.length > 40) return apiFail('请填写姓名（不超过 40 字）')
  if (!isValidPhone(phone)) return apiFail('请填写有效的手机号（6-20 位数字）')
  const passwordError = validatePassword(password)
  if (passwordError) return apiFail(passwordError)

  if (await prisma.hrUser.findUnique({ where: { phone } })) {
    return apiFail('该手机号已在人员名单中', 409)
  }

  const { hash, salt } = hashPassword(password as string)
  try {
    const user = await prisma.hrUser.create({
      data: { name, phone, passwordHash: hash, passwordSalt: salt, role, enabled: true },
    })
    return NextResponse.json({ ok: true, user: toPublicHrUser(user) })
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') {
      return apiFail('该手机号已在人员名单中', 409)
    }
    console.error('[auth/staff]', error)
    return apiFail('登记失败，请稍后重试', 500)
  }
}
