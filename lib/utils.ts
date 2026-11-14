import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 安全解析查询参数为整数。
 *
 * - 参数非法（null / 非数字 / NaN）时回落 fallback
 * - 解析结果越界时夹取到 [min, max] 边界
 *
 * 用于替代路由中的裸 parseInt（NaN 会静默产生 500）。典型用法：
 * `parseIntParam(searchParams.get('page'), 1, { min: 1 })`、
 * `parseIntParam(searchParams.get('pageSize'), 20, { min: 1, max: 100 })`
 */
export function parseIntParam(
  param: string | null,
  fallback: number,
  options: { min?: number; max?: number } = {}
): number {
  if (param === null || param === '' || param.trim() === '') {
    return fallback
  }
  const parsed = Number.parseInt(param, 10)
  if (Number.isNaN(parsed)) {
    return fallback
  }
  const min = options.min ?? -Infinity
  const max = options.max ?? Infinity
  if (parsed < min) return min
  if (parsed > max) return max
  return parsed
}
