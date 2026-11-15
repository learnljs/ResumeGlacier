import { describe, expect, it } from 'vitest'
import { decideAccess, isPublicPath } from '@/lib/services/auth-policy'

describe('放行清单', () => {
  it('登录页与初始化页始终放行', () => {
    expect(isPublicPath('/login')).toBe(true)
    expect(isPublicPath('/setup')).toBe(true)
    expect(decideAccess('/login', false)).toBe('allow')
  })

  it('鉴权模块、定时任务与健康检查放行', () => {
    expect(isPublicPath('/api/auth/login')).toBe(true)
    expect(isPublicPath('/api/auth/staff')).toBe(true)
    expect(isPublicPath('/api/cron/fetch-emails')).toBe(true)
    expect(isPublicPath('/api/health')).toBe(true)
  })

  it('业务配置接口不会被误放行', () => {
    expect(isPublicPath('/api/config/ai')).toBe(false)
    expect(isPublicPath('/api/resumes')).toBe(false)
    expect(isPublicPath('/resume/dashboard')).toBe(false)
    expect(isPublicPath('/setup-extra')).toBe(false)
  })
})

describe('访问判定', () => {
  it('未登录访问页面跳登录页', () => {
    expect(decideAccess('/resume/dashboard', false)).toBe('redirect-login')
    expect(decideAccess('/', false)).toBe('redirect-login')
  })

  it('未登录调业务 API 返回 401 而不是跳转', () => {
    expect(decideAccess('/api/resumes', false)).toBe('unauthorized')
    expect(decideAccess('/api/config/email', false)).toBe('unauthorized')
  })

  it('会话有效时业务页面与 API 都放行', () => {
    expect(decideAccess('/resume/dashboard', true)).toBe('allow')
    expect(decideAccess('/api/resumes', true)).toBe('allow')
  })
})
