import { describe, expect, it } from 'vitest'
import { apiErrorMessage, DEFAULT_API_ERROR } from '@/lib/utils/api-message'

describe('apiErrorMessage', () => {
  it('保留后端给出的可读业务错误', () => {
    expect(apiErrorMessage(new Error('该职位已存在'))).toBe('该职位已存在')
  })

  it('支持字符串与响应体对象', () => {
    expect(apiErrorMessage('端口需为 1–65535 之间的整数')).toBe('端口需为 1–65535 之间的整数')
    expect(apiErrorMessage({ error: '简历不存在' })).toBe('简历不存在')
    expect(apiErrorMessage({ message: '没有权限执行此操作' })).toBe('没有权限执行此操作')
  })

  it('技术性错误换成业务化兜底文案，不泄漏内部细节', () => {
    const fallback = '保存失败，请稍后重试'
    expect(apiErrorMessage(new Error('PrismaClientKnownRequestError: Unique constraint failed'), fallback)).toBe(fallback)
    expect(apiErrorMessage(new Error('connect ECONNREFUSED 127.0.0.1:5432'), fallback)).toBe(fallback)
    expect(apiErrorMessage(new Error('Invalid initialization vector'), fallback)).toBe(fallback)
    expect(apiErrorMessage(new Error('Cannot read properties of undefined'), fallback)).toBe(fallback)
  })

  it('多行堆栈不展示', () => {
    expect(apiErrorMessage(new Error('line one\n    at handler (app/api/x.ts:12:3)'), '失败了')).toBe('失败了')
  })

  it('去掉技术前缀', () => {
    expect(apiErrorMessage(new Error('Error: 邮箱地址格式不正确'))).toBe('邮箱地址格式不正确')
    expect(apiErrorMessage(new Error('请求失败: 参数不完整'))).toBe('参数不完整')
  })

  it('超长文案截断', () => {
    const result = apiErrorMessage(new Error('很'.repeat(300)))
    expect(result.length).toBe(121)
    expect(result.endsWith('…')).toBe(true)
  })

  it('空值统一回退到正式提示', () => {
    expect(apiErrorMessage(null)).toBe(DEFAULT_API_ERROR)
    expect(apiErrorMessage(undefined)).toBe(DEFAULT_API_ERROR)
    expect(apiErrorMessage(new Error(''))).toBe(DEFAULT_API_ERROR)
    expect(apiErrorMessage({})).toBe(DEFAULT_API_ERROR)
  })
})
