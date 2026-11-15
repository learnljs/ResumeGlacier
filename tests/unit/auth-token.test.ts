import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildSessionPayload,
  hasSessionSecret,
  hashPassword,
  isValidPhone,
  normalizePhone,
  safeStringEqual,
  signSession,
  validatePassword,
  verifyPassword,
  verifySession,
} from '@/lib/services/auth-token'

const TEST_SECRET = 'unit-test-session-secret'
let previousSecret: string | undefined
let previousKey: string | undefined

beforeEach(() => {
  previousSecret = process.env.SESSION_SECRET
  previousKey = process.env.ENCRYPTION_KEY
  process.env.SESSION_SECRET = TEST_SECRET
  delete process.env.ENCRYPTION_KEY
})

afterEach(() => {
  if (previousSecret === undefined) delete process.env.SESSION_SECRET
  else process.env.SESSION_SECRET = previousSecret
  if (previousKey === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = previousKey
})

const sampleUser = {
  id: 'user-1',
  phone: '13800138000',
  role: 'ADMIN',
  passwordHash: 'a1b2c3d4e5f6'.repeat(6),
}

describe('密码哈希', () => {
  it('同一密码两次哈希因随机盐而不同', () => {
    const first = hashPassword('correct-horse')
    const second = hashPassword('correct-horse')
    expect(first.salt).not.toBe(second.salt)
    expect(first.hash).not.toBe(second.hash)
  })

  it('正确密码通过，错误密码失败', () => {
    const { hash, salt } = hashPassword('correct-horse')
    expect(verifyPassword('correct-horse', hash, salt)).toBe(true)
    expect(verifyPassword('wrong-horse', hash, salt)).toBe(false)
  })

  it('哈希被损坏时不抛异常，按校验失败处理', () => {
    const { salt } = hashPassword('correct-horse')
    expect(verifyPassword('correct-horse', 'not-hex!!', salt)).toBe(false)
    expect(verifyPassword('correct-horse', '', salt)).toBe(false)
  })

  it('密码规则只接受 8-72 位', () => {
    expect(validatePassword('short')).not.toBeNull()
    expect(validatePassword('a'.repeat(73))).not.toBeNull()
    expect(validatePassword('a'.repeat(8))).toBeNull()
    expect(validatePassword(null)).not.toBeNull()
  })
})

describe('会话签名', () => {
  it('签发后可校验，且字段与密码指纹完整', () => {
    const payload = buildSessionPayload(sampleUser)
    const token = signSession(payload)
    expect(verifySession(token)).toEqual(payload)
    expect(payload.pv).toBe(sampleUser.passwordHash.slice(0, 12))
  })

  it('篡改载荷或签名都会失效', () => {
    const token = signSession(buildSessionPayload(sampleUser))
    const [body, sig] = token.split('.')
    const tampered = Buffer.from(
      JSON.stringify({ ...buildSessionPayload(sampleUser), role: 'STAFF', exp: 9999999999 })
    ).toString('base64url')
    expect(verifySession(`${tampered}.${sig}`)).toBeNull()
    expect(verifySession(`${body}.${sig.slice(0, -2)}zz`)).toBeNull()
  })

  it('过期会话失效', () => {
    const payload = { ...buildSessionPayload(sampleUser), exp: 1 }
    expect(verifySession(signSession(payload))).toBeNull()
  })

  it('结构不完整的 token 一律失效', () => {
    expect(verifySession(undefined)).toBeNull()
    expect(verifySession('')).toBeNull()
    expect(verifySession('abc')).toBeNull()
    expect(verifySession('a.b.c')).toBeNull()
    expect(verifySession(`${Buffer.from('{}').toString('base64url')}.x`)).toBeNull()
  })

  it('换密钥后旧会话立即失效', () => {
    const token = signSession(buildSessionPayload(sampleUser))
    process.env.SESSION_SECRET = 'another-secret'
    expect(verifySession(token)).toBeNull()
  })

  it('缺少会话密钥时校验失败且签发明确报错', () => {
    const token = signSession(buildSessionPayload(sampleUser))
    delete process.env.SESSION_SECRET
    expect(hasSessionSecret()).toBe(false)
    expect(verifySession(token)).toBeNull()
    expect(() => signSession(buildSessionPayload(sampleUser))).toThrow(/缺少会话密钥/)
  })
})

describe('手机号归一化与常量时间比较', () => {
  it('去掉空格与连字符', () => {
    expect(normalizePhone(' 138-0013-8000 ')).toBe('13800138000')
    expect(normalizePhone(undefined)).toBe('')
  })

  it('只接受 6-20 位纯数字', () => {
    expect(isValidPhone('13800138000')).toBe(true)
    expect(isValidPhone('abcdef')).toBe(false)
    expect(isValidPhone('12345')).toBe(false)
  })

  it('相同字符串相等，长度不同为假', () => {
    expect(safeStringEqual('abc', 'abc')).toBe(true)
    expect(safeStringEqual('abc', 'ab')).toBe(false)
  })
})
