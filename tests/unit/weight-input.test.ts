import { describe, expect, it } from 'vitest'
import {
  WEIGHT_TOTAL,
  WEIGHT_SUM_EPSILON,
  clampWeightInput,
  equalWeights,
  isWeightSumValid,
  normalizeWeightInput,
  parseWeightsJson,
  sumWeights,
  weightsToNum,
  weightsToStr,
} from '@/lib/hooks/use-weight-input'

describe('clampWeightInput — 输入态钳制', () => {
  it('空串保留，允许清空重输', () => {
    expect(clampWeightInput('')).toBe('')
    expect(clampWeightInput('abc')).toBe('')
    expect(clampWeightInput('---')).toBe('')
  })

  it('只保留数字、去前导零，再按 100 上限钳制', () => {
    expect(clampWeightInput('25')).toBe('25')
    expect(clampWeightInput('007')).toBe('7')
    expect(clampWeightInput('1a2b3')).toBe('100') // 拼出 123 后仍受上限约束
    expect(clampWeightInput('-5')).toBe('5')
    expect(clampWeightInput('3.5')).toBe('35')
  })

  it('上限 100', () => {
    expect(clampWeightInput('100')).toBe('100')
    expect(clampWeightInput('101')).toBe('100')
    expect(clampWeightInput('9999')).toBe('100')
  })
})

describe('normalizeWeightInput — 失焦归一化', () => {
  it('空值补 0、去前导零、非法值归零', () => {
    expect(normalizeWeightInput('')).toBe('0')
    expect(normalizeWeightInput('007')).toBe('7')
    expect(normalizeWeightInput('42')).toBe('42')
    expect(normalizeWeightInput('abc')).toBe('0')
  })
})

describe('权重映射互转', () => {
  it('数字映射转字符串映射', () => {
    expect(weightsToStr({ knowledge: 90, skill: 10 })).toEqual({ knowledge: '90', skill: '10' })
    expect(weightsToStr({})).toEqual({})
  })

  it('字符串映射转数字映射，解析失败按 0', () => {
    expect(weightsToNum({ a: '30', b: '70', c: '', d: 'oops' })).toEqual({ a: 30, b: 70, c: 0, d: 0 })
  })

  it('往返转换保持数值', () => {
    const original = { knowledge: 60, skill: 40 }
    expect(weightsToNum(weightsToStr(original))).toEqual(original)
  })

  it('从 JSON 安全解析，异常输入返回空对象', () => {
    expect(parseWeightsJson('{"knowledge":90,"skill":10}')).toEqual({ knowledge: '90', skill: '10' })
    expect(parseWeightsJson('not-json')).toEqual({})
    expect(parseWeightsJson('null')).toEqual({})
  })
})

describe('sumWeights / isWeightSumValid — 总和校验', () => {
  it('求和', () => {
    expect(sumWeights({})).toBe(0)
    expect(sumWeights({ a: 30, b: 70 })).toBe(100)
    expect(sumWeights({ a: 33.3, b: 33.3, c: 33.4 })).toBeCloseTo(100, 10)
  })

  it('容差内视为有效', () => {
    expect(WEIGHT_TOTAL).toBe(100)
    expect(WEIGHT_SUM_EPSILON).toBe(0.01)
    expect(isWeightSumValid(100)).toBe(true)
    expect(isWeightSumValid(100 - 0.005)).toBe(true)
    expect(isWeightSumValid(99.98)).toBe(false)
    expect(isWeightSumValid(100.02)).toBe(false)
    expect(isWeightSumValid(0)).toBe(false)
  })
})

describe('equalWeights — 新建模型默认权重', () => {
  it('整除时均分', () => {
    expect(equalWeights(['a', 'b', 'c', 'd'])).toEqual({ a: '25', b: '25', c: '25', d: '25' })
  })

  it('余数补给第一项，总和恒为 100', () => {
    expect(equalWeights(['a', 'b', 'c'])).toEqual({ a: '34', b: '33', c: '33' })
    expect(equalWeights(['a', 'b', 'c', 'd', 'e', 'f'])).toEqual({
      a: '20', b: '16', c: '16', d: '16', e: '16', f: '16',
    })
    for (const keys of [['a'], ['a', 'b', 'c'], ['a', 'b', 'c', 'd', 'e', 'f', 'g']]) {
      expect(sumWeights(weightsToNum(equalWeights(keys)))).toBe(100)
    }
  })

  it('空维度返回空对象', () => {
    expect(equalWeights([])).toEqual({})
  })
})
