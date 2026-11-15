import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'

/**
 * 登录会话与密码凭证的纯计算层。
 *
 * 这一层不依赖 Prisma / Next 请求对象，因此可以同时被 proxy.ts（网络边界）
 * 和 API 路由引用。请不要在这里引入数据库或文件系统依赖。
 *
 * 会话采用「签名 cookie」而非服务端 session 表：
 * 载荷 base64url(uid/phone/role/exp) + HMAC-SHA256 签名，密钥由
 * SESSION_SECRET（优先）或 ENCRYPTION_KEY 派生，避免与 AES 密钥直接复用。
 */

export const AUTH_COOKIE = 'hr_session'

/** 8 小时，覆盖一个工作日；停用/改密的即时性边界见 README 鉴权章节 */
export const SESSION_TTL_SECONDS = 8 * 60 * 60

const KEY_DERIVE_LABEL = 'resume-glacier/session/v1'

export type HrRole = 'ADMIN' | 'STAFF'

export interface SessionPayload {
  uid: string
  phone: string
  role: HrRole
  /** Unix 秒，过期时间 */
  exp: number
  /** 密码指纹：改密 / 重置密码后让所有旧会话立即失效 */
  pv: string
}

function getSecret(): Buffer {
  const raw = process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY
  if (!raw) {
    throw new Error('缺少会话密钥：请在 .env 配置 SESSION_SECRET 或 ENCRYPTION_KEY')
  }
  return createHmac('sha256', KEY_DERIVE_LABEL).update(raw).digest()
}

/** 是否具备签发/校验会话的条件（用于给 API 返回明确的配置错误，而不是 500） */
export function hasSessionSecret(): boolean {
  return Boolean(process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY)
}

export function hashPassword(
  password: string,
  salt: string = randomBytes(16).toString('hex')
): { hash: string; salt: string } {
  const hash = scryptSync(password, salt, 64).toString('hex')
  return { hash, salt }
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const expected = Buffer.from(hash, 'hex')
    if (expected.length === 0) return false
    const actual = scryptSync(password, salt, expected.length)
    return timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

/** 常量时间比较两个字符串，长度不等也先走一次比较以降低时序差异 */
export function safeStringEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/** 手机号统一为纯数字，允许 6-20 位；名单比对也基于这个归一化结果 */
export function normalizePhone(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input.replace(/[\s-]/g, '')
}

export function isValidPhone(phone: string): boolean {
  return /^\d{6,20}$/.test(phone)
}

/** 密码强度：8-72 位；不做字符组合要求，避免给 HR 增加使用负担 */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    return '密码长度需为 8-72 位'
  }
  return null
}

export function buildSessionPayload(user: {
  id: string
  phone: string
  role: string
  passwordHash?: string
}): SessionPayload {
  return {
    uid: user.id,
    phone: user.phone,
    role: user.role === 'ADMIN' ? 'ADMIN' : 'STAFF',
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    pv: user.passwordHash?.slice(0, 12) ?? '',
  }
}

export function signSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', getSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

/**
 * 校验失败一律返回 null（安全默认：验不了就当作未登录）。
 * 包含签名校验、载荷结构校验与过期校验。
 */
export function verifySession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null
  try {
    const [body, sig, extra] = token.split('.')
    if (!body || !sig || extra !== undefined) return null

    const expected = createHmac('sha256', getSecret()).update(body).digest('base64url')
    if (!safeStringEqual(sig, expected)) return null

    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8')
    ) as Partial<SessionPayload>

    if (
      typeof payload.uid !== 'string' ||
      typeof payload.phone !== 'string' ||
      (payload.role !== 'ADMIN' && payload.role !== 'STAFF') ||
      typeof payload.pv !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null
    }

    return payload as SessionPayload
  } catch {
    return null
  }
}
