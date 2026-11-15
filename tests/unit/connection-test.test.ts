import { describe, expect, it } from 'vitest'
import {
  describeConnectionError,
  evaluateChatTest,
} from '@/lib/utils/connection-test'

describe('evaluateChatTest — 测试连接只认真回复', () => {
  it('真实返回文本才算成功', () => {
    const verdict = evaluateChatTest(
      {
        choices: [{ message: { content: '连接成功' }, finish_reason: 'stop' }],
        model: 'gpt-4o',
        usage: { total_tokens: 12 },
      },
      'gpt-4o',
    )
    expect(verdict.success).toBe(true)
    expect(verdict.reply).toBe('连接成功')
    expect(verdict.tokenUsage).toBe(12)
  })

  it('空响应 / 无 choices 不算成功（旧版会假成功）', () => {
    expect(evaluateChatTest({}, 'gpt-4o').success).toBe(false)
    expect(evaluateChatTest({ choices: [] }, 'gpt-4o').success).toBe(false)
    expect(evaluateChatTest(null).success).toBe(false)
  })

  it('错误对象伪装成 200 响应也不算成功', () => {
    const errorBody = {
      error: { message: 'Incorrect API key provided', type: 'invalid_request_error' },
    } as unknown as Parameters<typeof evaluateChatTest>[0]
    expect(evaluateChatTest(errorBody).success).toBe(false)
  })

  it('回复只有空白字符不算成功', () => {
    expect(
      evaluateChatTest({ choices: [{ message: { content: '   \n  ' } }] }).success,
    ).toBe(false)
  })

  it('接口未回传 model 时回退到请求里的模型名', () => {
    const verdict = evaluateChatTest(
      { choices: [{ message: { content: 'ok' } }] },
      'deepseek-chat',
    )
    expect(verdict.model).toBe('deepseek-chat')
  })

  it('回复内容做过 trim', () => {
    expect(
      evaluateChatTest({ choices: [{ message: { content: '  连接成功  ' } }] }).reply,
    ).toBe('连接成功')
  })
})

describe('describeConnectionError', () => {
  it('超时给出独立提示', () => {
    expect(describeConnectionError(new Error('Request timed out.'), 20_000)).toContain('20')
    expect(describeConnectionError(new Error('Request timed out.'), 20_000)).toContain('超时')
  })

  it('普通错误保留原始原因', () => {
    expect(describeConnectionError(new Error('ECONNREFUSED'))).toContain('ECONNREFUSED')
  })
})
