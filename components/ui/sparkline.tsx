'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'primary' | 'accent' | 'success' | 'destructive' | 'warning' | 'muted'

const TONE_COLOR: Record<Tone, string> = {
  primary: 'hsl(var(--primary))',
  accent: 'hsl(var(--accent))',
  success: 'hsl(var(--success))',
  destructive: 'hsl(var(--destructive))',
  warning: 'hsl(var(--warning))',
  muted: 'hsl(var(--muted-foreground))',
}

interface SparklineProps {
  /** 序列；null 表示该点无数据，曲线在此断开 */
  data: Array<number | null>
  tone?: Tone
  className?: string
  /** 口径说明，同时作为无障碍标签与悬浮提示 */
  label?: string
}

/**
 * 迷你走势线 —— 纯 SVG，不依赖图表库
 *
 * 卡内只用来看"方向"，不承载精确读数，因此不画坐标轴与刻度。
 * 面积用线性渐变淡出，描边走 non-scaling-stroke，避免被 viewBox 拉伸成粗细不均。
 */
export function Sparkline({ data, tone = 'primary', className, label }: SparklineProps) {
  // useId 在 SSR 与客户端生成带冒号的 id，冒号在 url(#) 里需要去掉
  const uid = useId().replace(/:/g, '')
  const color = TONE_COLOR[tone]

  const W = 100
  const H = 32
  const PAD = 3

  const values = data.filter((v): v is number => v !== null)
  if (values.length < 2) {
    return <div className={cn('h-9 w-full', className)} aria-hidden />
  }

  const max = Math.max(...values)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  // 全段取值相同（例如七天都是 100% 通过率）时，画一条居中平线且不填面积，
  // 否则"顶部直线 + 填满面积"会糊成一块实心色块，看起来像渲染错误
  const flat = max === min

  const x = (i: number) => (data.length <= 1 ? W / 2 : (i / (data.length - 1)) * W)
  const y = (v: number) => (flat ? H / 2 : H - PAD - ((v - min) / span) * (H - PAD * 2))

  // 按 null 断点切段：某天没有分母时曲线断开，而不是掉到 0 造成假下跌
  const segments: Array<Array<{ x: number; y: number }>> = []
  let current: Array<{ x: number; y: number }> = []
  data.forEach((v, i) => {
    if (v === null) {
      if (current.length > 0) {
        segments.push(current)
        current = []
      }
      return
    }
    current.push({ x: x(i), y: y(v) })
  })
  if (current.length > 0) segments.push(current)

  const lines = segments.filter((s) => s.length > 1)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn('h-9 w-full', className)}
      role="img"
      aria-label={label}
    >
      {label && <title>{label}</title>}
      <defs>
        <linearGradient id={`spark-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {lines.map((seg, idx) => {
        const line = seg
          .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
          .join(' ')
        const area = `${line} L${seg[seg.length - 1].x.toFixed(2)},${H} L${seg[0].x.toFixed(2)},${H} Z`
        return (
          <g key={idx}>
            {!flat && <path d={area} fill={`url(#spark-${uid})`} />}
            <path
              d={line}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}
    </svg>
  )
}
