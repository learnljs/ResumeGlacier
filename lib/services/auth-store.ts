import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { AUTH_COOKIE, verifySession } from '@/lib/services/auth-token'
import type { HrUser } from '@prisma/client'

/** 对外可返回的安全字段，永不包含 passwordHash / passwordSalt */
export interface PublicHrUser {
  id: string
  name: string
  phone: string
  role: string
  enabled: boolean
  lastLoginAt: string | null
  createdAt: string
}

export function toPublicHrUser(user: HrUser): PublicHrUser {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    enabled: user.enabled,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  }
}

export async function countHrUsers(): Promise<number> {
  return prisma.hrUser.count()
}

/**
 * 取当前登录用户：先校验签名 cookie，再回查数据库。
 * 回查可让「停用 / 删除 / 换手机号」在下一个请求立刻生效，
 * 弥补签名 cookie 本身无法即时吊销的不足。
 */
export async function getSessionUser(): Promise<HrUser | null> {
  const store = await cookies()
  const session = verifySession(store.get(AUTH_COOKIE)?.value)
  if (!session) return null

  const user = await prisma.hrUser.findUnique({ where: { id: session.uid } })
  if (!user || !user.enabled || user.phone !== session.phone) return null
  // 密码指纹不一致（改密或管理员重置过）→ 旧会话立即作废
  if (user.passwordHash.slice(0, 12) !== session.pv) return null
  return user
}

export async function isAdmin(): Promise<boolean> {
  const user = await getSessionUser()
  return user?.role === 'ADMIN'
}

/** 是否仍处于冷启动（人员名单为空） */
export async function needsSetup(): Promise<boolean> {
  return (await countHrUsers()) === 0
}
