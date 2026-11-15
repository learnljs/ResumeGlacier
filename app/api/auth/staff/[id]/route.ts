import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiFail, readJsonBody } from '@/lib/services/auth-http'
import { getSessionUser, toPublicHrUser } from '@/lib/services/auth-store'
import { hashPassword, validatePassword } from '@/lib/services/auth-token'

type RouteContext = { params: Promise<{ id: string }> }

/** 改资料 / 启用停用 / 改角色 / 重置密码 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const current = await getSessionUser()
  if (!current) return apiFail('登录状态已失效，请重新登录', 401)
  if (current.role !== 'ADMIN') return apiFail('仅管理员可管理人员名单', 403)

  const { id } = await context.params
  const target = await prisma.hrUser.findUnique({ where: { id } })
  if (!target) return apiFail('人员不存在', 404)

  const body = await readJsonBody(request)
  if (!body) return apiFail('请求格式不正确')

  const data: {
    name?: string
    enabled?: boolean
    role?: string
    passwordHash?: string
    passwordSalt?: string
  } = {}

  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 40) return apiFail('请填写姓名（不超过 40 字）')
    data.name = name
  }

  if ('enabled' in body) {
    if (typeof body.enabled !== 'boolean') return apiFail('状态参数不正确')
    data.enabled = body.enabled
  }

  if ('role' in body) {
    if (body.role !== 'ADMIN' && body.role !== 'STAFF') return apiFail('角色参数不正确')
    data.role = body.role
  }

  if ('password' in body) {
    const passwordError = validatePassword(body.password)
    if (passwordError) return apiFail(passwordError)
    const { hash, salt } = hashPassword(body.password as string)
    data.passwordHash = hash
    data.passwordSalt = salt
  }

  if (Object.keys(data).length === 0) return apiFail('没有需要更新的内容')

  // 不能把自己停用或降级，否则会把自己锁在系统外
  const willLoseAdmin =
    id === current.id &&
    (data.enabled === false || (data.role && data.role !== 'ADMIN'))
  if (willLoseAdmin) return apiFail('不能停用或降级当前登录的管理员')

  // 至少要保留一个启用状态的管理员
  if (target.role === 'ADMIN' && (data.enabled === false || (data.role && data.role !== 'ADMIN'))) {
    const adminCount = await prisma.hrUser.count({ where: { role: 'ADMIN', enabled: true } })
    if (adminCount <= 1) return apiFail('系统需保留至少一名启用的管理员')
  }

  const updated = await prisma.hrUser.update({ where: { id }, data })
  return NextResponse.json({ ok: true, user: toPublicHrUser(updated) })
}

/** 移除人员；不能删自己，也不能删掉最后一名启用的管理员 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const current = await getSessionUser()
  if (!current) return apiFail('登录状态已失效，请重新登录', 401)
  if (current.role !== 'ADMIN') return apiFail('仅管理员可管理人员名单', 403)

  const { id } = await context.params
  if (id === current.id) return apiFail('不能删除当前登录的账号')

  const target = await prisma.hrUser.findUnique({ where: { id } })
  if (!target) return apiFail('人员不存在', 404)

  if (target.role === 'ADMIN' && target.enabled) {
    const adminCount = await prisma.hrUser.count({ where: { role: 'ADMIN', enabled: true } })
    if (adminCount <= 1) return apiFail('系统需保留至少一名启用的管理员')
  }

  await prisma.hrUser.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
