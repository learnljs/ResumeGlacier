'use client'

import { useCallback, useMemo, useState } from 'react'

/**
 * 权重输入（WeightModel 编辑）共享逻辑。
 *
 * 权重的「输入态」统一用字符串保存，避免空串被强转为 0 导致无法继续输入。
 * 早期「多模型」时代由 WeightModelCard（编辑）与 WeightModelGroup（新建）各自
 * 复制了一套「onChange 钳制 / onBlur 归一化 / 总和校验」，此处收敛为单点；
 * 现在统一由 WeightModelEditor（每职位每分类唯一模型）复用。
 */

/** 权重输入态：维度 key -> 字符串值 */
export type WeightStringMap = Record<string, string>

/** 权重总和目标值 */
export const WEIGHT_TOTAL = 100

/** 总和容差（浮点比较） */
export const WEIGHT_SUM_EPSILON = 0.01

/**
 * 输入框 onChange 钳制：只保留数字字符，上限 100；空串保留（允许清空重输）。
 */
export function clampWeightInput(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '')
  if (digits === '') return ''
  const n = parseInt(digits, 10)
  if (Number.isNaN(n)) return ''
  return String(Math.min(WEIGHT_TOTAL, n))
}

/**
 * 输入框 onBlur 归一化：空值填 0，否则去掉前导零。
 */
export function normalizeWeightInput(raw: string): string {
  if (raw === '') return '0'
  return String(parseInt(raw, 10) || 0)
}

/** 数字映射 -> 字符串映射 */
export function weightsToStr(weights: Record<string, number>): WeightStringMap {
  const result: WeightStringMap = {}
  for (const [k, v] of Object.entries(weights)) result[k] = String(v)
  return result
}

/** 字符串映射 -> 数字映射（解析失败按 0） */
export function weightsToNum(weights: WeightStringMap): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [k, v] of Object.entries(weights)) result[k] = parseInt(v, 10) || 0
  return result
}

/** 从 weights JSON 字符串安全解析为字符串映射（解析失败返回空对象） */
export function parseWeightsJson(json: string): WeightStringMap {
  try {
    return weightsToStr(JSON.parse(json) as Record<string, number>)
  } catch {
    return {}
  }
}

/** 权重总和 */
export function sumWeights(weights: Record<string, number>): number {
  return Object.values(weights).reduce((a, b) => a + b, 0)
}

/** 总和是否为 100%（容差 0.01） */
export function isWeightSumValid(sum: number): boolean {
  return Math.abs(sum - WEIGHT_TOTAL) <= WEIGHT_SUM_EPSILON
}

/**
 * 均分权重（余数补给第一项），用于新建模型的默认值。
 * 例：4 个维度 -> 25/25/25/25；3 个 -> 34/33/33。
 */
export function equalWeights(keys: string[]): WeightStringMap {
  const base = Math.floor(WEIGHT_TOTAL / keys.length)
  const remainder = WEIGHT_TOTAL - base * keys.length
  const result: WeightStringMap = {}
  keys.forEach((key, i) => {
    result[key] = String(base + (i === 0 ? remainder : 0))
  })
  return result
}

export interface UseWeightInputReturn {
  /** 字符串输入态 */
  weights: WeightStringMap
  /** 解析后的数字映射 */
  nums: Record<string, number>
  /** 当前总和 */
  sum: number
  /** 总和是否恰好 100% */
  isValid: boolean
  /** Input onChange：钳制输入 */
  handleChange: (key: string, raw: string) => void
  /** Input onBlur：归一化（空 -> 0、去前导零） */
  handleBlur: (key: string) => void
  /** 直接赋值（如 Slider 拖动） */
  setWeight: (key: string, value: number | string) => void
  /** 用外部数据整体重置（模型刷新 / 新建表单复位） */
  reset: (next: WeightStringMap) => void
}

/**
 * 权重输入状态管理。初始值与重置值均以字符串映射传入。
 */
export function useWeightInput(initial: WeightStringMap): UseWeightInputReturn {
  const [weights, setWeights] = useState<WeightStringMap>(initial)

  const nums = useMemo(() => weightsToNum(weights), [weights])
  const sum = useMemo(() => sumWeights(nums), [nums])
  const isValid = isWeightSumValid(sum)

  const handleChange = useCallback((key: string, raw: string) => {
    setWeights((prev) => ({ ...prev, [key]: clampWeightInput(raw) }))
  }, [])

  const handleBlur = useCallback((key: string) => {
    setWeights((prev) => ({ ...prev, [key]: normalizeWeightInput(prev[key] ?? '') }))
  }, [])

  const setWeight = useCallback((key: string, value: number | string) => {
    setWeights((prev) => ({
      ...prev,
      [key]: typeof value === 'number' ? String(value) : value,
    }))
  }, [])

  const reset = useCallback((next: WeightStringMap) => setWeights(next), [])

  return { weights, nums, sum, isValid, handleChange, handleBlur, setWeight, reset }
}
