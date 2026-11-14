'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import {
  Loader2,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Download,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { PositionTrendCompareChart } from '@/components/resume/PositionTrendCompareChart'
import {
  DashboardScopeFilter,
  type ScopeOption,
  type ScopeValue,
} from '@/components/resume/DashboardScopeFilter'
import { FollowUpBoard } from '@/components/resume/FollowUpBoard'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Sparkline } from '@/components/ui/sparkline'

interface DashboardData {
  stats: {
    totalResumes: number
    todayResumes: number
    weekResumes: number
    monthResumes: number
    pendingResumes: number
    screenedResumes: number
    errorResumes: number
    unparsedResumes: number
    parsingResumes: number
    passRate: number
  }
  positionStats: Array<{ id: string; title: string; resumeCount: number }>
  unassignedCount: number
  /** 邮箱 / 来源维度的可选项，数量 ≥2 时才展示切换控件 */
  filters: {
    emailConfigs: ScopeOption[]
    sources: ScopeOption[]
    applied: ScopeValue
  }
  /** KPI 方案 B：近 7 日流水序列，用于卡片迷你走势与环比 */
  kpi: {
    screenedDoneDaily: number[]
    errorDaily: number[]
    passRateDaily: Array<number | null>
    today: { screenedDone: number; errors: number; passRate: number | null }
    yesterday: { screenedDone: number; errors: number; passRate: number | null }
    weekErrors: number
    weekScreenedDone: number
  }
  emailConfigs: Array<{
    id: string
    alias: string
    user: string
    lastFetchedAt: string | null
  }>
}

/**
 * 单条 KPI 卡 — 左侧品牌色边条 + 浅色 icon 背景，与品牌色系统一
 */
interface KpiCardProps {
  label: string
  value: number | string
  hint?: string
  icon: React.ReactNode
  accent: 'primary' | 'accent' | 'success' | 'destructive' | 'muted'
  /** 近 7 日序列；不传则不画走势 */
  series?: Array<number | null>
  /** 走势口径说明，显示在曲线右上方 */
  seriesLabel?: string
  /** 环比数值；unit='pp' 时表示百分点差 */
  delta?: number | null
  deltaUnit?: 'percent' | 'pp'
  /** 数值上升是好事还是坏事，决定徽章颜色 */
  deltaGoodWhen?: 'up' | 'down'
}

const ACCENT_STYLES: Record<KpiCardProps['accent'], { bar: string; iconBg: string; iconFg: string }> = {
  primary:     { bar: 'bg-primary',     iconBg: 'bg-primary/10',     iconFg: 'text-primary' },
  accent:      { bar: 'bg-accent',      iconBg: 'bg-accent/10',      iconFg: 'text-accent' },
  success:     { bar: 'bg-success',     iconBg: 'bg-success/10',     iconFg: 'text-success' },
  destructive: { bar: 'bg-destructive', iconBg: 'bg-destructive/10', iconFg: 'text-destructive' },
  muted:       { bar: 'bg-muted-foreground/40', iconBg: 'bg-muted', iconFg: 'text-muted-foreground' },
}

/** 今日 vs 昨日的变化率；昨日为 0 时百分比无意义，返回 null 不显示徽章 */
function ratioDelta(today: number, yesterday: number): number | null {
  if (!yesterday) return null
  return Math.round(((today - yesterday) / yesterday) * 100)
}

/** 环比徽章：今日 vs 昨日；持平单独成一种状态 */
function DeltaBadge({
  delta,
  unit = 'percent',
  goodWhen = 'up',
}: {
  delta: number | null
  unit?: 'percent' | 'pp'
  goodWhen?: 'up' | 'down'
}) {
  if (typeof delta !== 'number' || Number.isNaN(delta)) return null
  if (delta === 0) {
    return (
      <span
        className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground"
        title="较昨日"
      >
        持平
      </span>
    )
  }
  const up = delta > 0
  // 有些指标涨了是坏事（错误数），颜色按 goodWhen 判，不按涨跌判
  const isGood = up === (goodWhen === 'up')
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
        isGood ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
      )}
      title="较昨日"
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}
      {delta}
      {unit === 'pp' ? 'pp' : '%'}
    </span>
  )
}

function KpiCard({
  label,
  value,
  hint,
  icon,
  accent,
  series,
  seriesLabel,
  delta,
  deltaUnit,
  deltaGoodWhen,
}: KpiCardProps) {
  const tone = ACCENT_STYLES[accent]

  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${tone.bar}`} />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
              {label}
            </p>
            <p className="mt-2 text-3xl font-bold text-foreground tabular-nums">{value}</p>
          </div>
          <div className={`h-11 w-11 shrink-0 rounded-lg ${tone.iconBg} flex items-center justify-center`}>
            <div className={tone.iconFg}>{icon}</div>
          </div>
        </div>

        {series && series.length > 1 && (
          <div className="mt-3">
            {/* 环比徽章与曲线同口径，避免被读成"存量数字"的变化 */}
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate text-[10px] text-muted-foreground/70">{seriesLabel}</span>
              <DeltaBadge delta={delta ?? null} unit={deltaUnit} goodWhen={deltaGoodWhen} />
            </div>
            <Sparkline data={series} tone={accent} label={seriesLabel} />
          </div>
        )}

        {hint && <p className="mt-2 text-xs text-muted-foreground truncate">{hint}</p>}
      </CardContent>
    </Card>
  )
}

/**
 * 横幅指标 — 大数字 + 说明，横向并排成一条数据带
 *
 * hero 用于「总量」，字号更大，保证总量是首屏第一眼落点；
 * 后面的今日/本周新增用次级字号，形成"总量 → 增量"的阅读顺序。
 */
function BannerMetric({
  value,
  label,
  note,
  hero = false,
}: {
  value: number
  label: string
  note?: React.ReactNode
  hero?: boolean
}) {
  return (
    <div className="flex items-end gap-3">
      <span
        className={cn(
          'font-bold leading-none tabular-nums text-foreground',
          hero ? 'text-[40px]' : 'text-[30px]'
        )}
      >
        {value}
      </span>
      <div className="pb-0.5">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {note && <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">{note}</div>}
      </div>
    </div>
  )
}

/** 横幅里分隔三个指标的竖线；窄屏换行后不再需要 */
function BannerDivider() {
  return <span className="hidden h-9 w-px shrink-0 bg-border sm:block" />
}

/**
 * 看板区块标题 — 左侧色条 + 标题 + 副标题，统一三个区块的视觉层级
 */
function SectionHeader({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div className="flex items-baseline gap-3 mb-4">
      <div className="h-5 w-1 rounded-full bg-primary" />
      <div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [fetchingAll, setFetchingAll] = useState(false)
  /** 切换邮箱/来源时的轻量刷新态：保留旧数据，不整页闪骨架 */
  const [scopeSwitching, setScopeSwitching] = useState(false)
  /** 近 7 日收取序列（横幅微型走势用） */
  const [weekSeries, setWeekSeries] = useState<number[]>([])
  /** 数据范围：默认全部；仅在存在多个邮箱/来源时可切换 */
  const [scope, setScope] = useState<ScopeValue>({})
  const loadedOnceRef = useRef(false)

  const scopeQuery = useCallback(() => {
    const params = new URLSearchParams()
    if (scope.emailConfigId) params.set('emailConfigId', scope.emailConfigId)
    if (scope.resumeSourceId) params.set('resumeSourceId', scope.resumeSourceId)
    return params.toString()
  }, [scope])

  // 加载摘要数据
  const loadStats = useCallback(async () => {
    if (loadedOnceRef.current) setScopeSwitching(true)
    try {
      const qs = scopeQuery()
      const res = await fetch(`/api/dashboard/stats${qs ? `?${qs}` : ''}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载失败'
      toast.error(msg)
    } finally {
      loadedOnceRef.current = true
      setStatsLoading(false)
      setScopeSwitching(false)
    }
  }, [scopeQuery])

  // 顶部快捷按钮：一键收取所有已配置邮箱
  const handleFetchAll = async (full: boolean) => {
    if (!data || data.emailConfigs.length === 0) return
    setFetchingAll(true)
    try {
      for (const cfg of data.emailConfigs) {
        const res = await fetch('/api/emails/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ configId: cfg.id, full, autoProcess: true }),
        })
        const json = await res.json()
        if (json.error) {
          toast.error(`${cfg.alias || cfg.user} 收取失败: ${json.error}`)
          continue
        }
        const t = json.total
        toast.success(
          `${cfg.alias || cfg.user} ${full ? '全量' : '增量'}收取完成: 获取${t.fetched}封邮件, 生成${t.generated}份简历` +
            (t.errors > 0 ? `, ${t.errors}个错误` : '')
        )
      }
      loadStats()
    } finally {
      setFetchingAll(false)
    }
  }

  // 首次加载 + 数据范围变化时重取
  useEffect(() => {
    loadStats()
  }, [loadStats])

  // 近 7 日收取序列：跟随数据范围；失败不影响主数据展示
  useEffect(() => {
    const qs = scopeQuery()
    fetch(`/api/dashboard/trends?granularity=daily&range=week${qs ? `&${qs}` : ''}`)
      .then((r) => r.json())
      .then((json) => {
        if (Array.isArray(json?.data)) {
          setWeekSeries(json.data.map((d: { count?: number }) => d.count ?? 0))
        }
      })
      .catch(() => {})
  }, [scopeQuery])

  if (statsLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-8">
        <Skeleton className="h-[150px] rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-5 w-28" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-xl" />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-[320px] rounded-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-[280px] rounded-xl" />
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-6 lg:p-8">
        <EmptyState
          icon={AlertCircle}
          title="数据加载失败"
          description="没能取到看板数据，请确认服务是否正常运行，或稍后重试。"
        />
      </div>
    )
  }

  const {
    totalResumes,
    todayResumes,
    weekResumes,
    pendingResumes,
    screenedResumes,
    errorResumes,
    unparsedResumes,
    parsingResumes,
    passRate,
  } = data.stats

  // 待处理 = 待解析 + 解析中 + 待筛选（HR 视角的"需要我处理"总量）
  const toProcess = unparsedResumes + parsingResumes + pendingResumes

  // 今日相对昨日的变化；昨日为 0 时不计算（除零）
  const todayDelta = (() => {
    if (weekSeries.length < 2) return null
    const last = weekSeries[weekSeries.length - 1]
    const prev = weekSeries[weekSeries.length - 2]
    if (!prev) return null
    return Math.round(((last - prev) / prev) * 100)
  })()

  const hasMailbox = data.emailConfigs.length > 0

  // 是否按邮箱 / 来源收窄了范围，决定「简历总数」的说明文案
  const scopeFiltered = Boolean(scope.emailConfigId || scope.resumeSourceId)

  // KPI 方案 B：三个存量指标各配一条可回算的流水曲线
  const kpi = data.kpi
  const screenedDoneDelta = ratioDelta(kpi.today.screenedDone, kpi.yesterday.screenedDone)
  const errorDelta = ratioDelta(kpi.today.errors, kpi.yesterday.errors)
  // 通过率是比率，环比用百分点差而不是百分比变化
  const passRateDelta =
    kpi.today.passRate !== null && kpi.yesterday.passRate !== null
      ? kpi.today.passRate - kpi.yesterday.passRate
      : null

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* ====== 指挥台横幅 ====== */}
      <div className="relative overflow-hidden rounded-xl border bg-card">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/[0.05] via-accent/[0.05] to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-grid-faint" />
        <div className="relative px-5 py-4">
          {/* 第一行：标题 + 指标带（总量在前，今日 / 本周新增在后） */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            {/* 标题 */}
            <div className="shrink-0">
              <h2 className="text-2xl font-bold tracking-tight">看板</h2>
              <p className="mt-1 text-xs text-muted-foreground">今日工作量与处理进度</p>
            </div>

            <div className="hidden h-10 w-px shrink-0 bg-border sm:block" />

            <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
              <BannerMetric
                hero
                value={totalResumes}
                label="简历总数"
                note={
                  <span className="text-xs text-muted-foreground">
                    {scopeFiltered ? '所选范围累计' : '全部累计'}
                  </span>
                }
              />
              <BannerDivider />
              <BannerMetric
                value={todayResumes}
                label="今日新增"
                note={<DeltaBadge delta={todayDelta} />}
              />
              <BannerDivider />
              <BannerMetric
                value={weekResumes}
                label="本周新增"
                note={<span className="text-xs text-muted-foreground">周一至今</span>}
              />
            </div>
          </div>

          {/* 第二行：数据范围（决定整页口径）+ 收取按钮 */}
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/60 pt-3">
            <DashboardScopeFilter
              emailConfigs={data.filters?.emailConfigs ?? []}
              sources={data.filters?.sources ?? []}
              value={scope}
              onChange={setScope}
            />
            {scopeSwitching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {hasMailbox && (
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFetchAll(false)}
                  disabled={fetchingAll}
                  className="gap-1.5"
                >
                  {fetchingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  增量获取
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFetchAll(true)}
                  disabled={fetchingAll}
                  className="gap-1.5"
                >
                  {fetchingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  全量获取
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ====== 核心指标 ====== */}
      <section>
        <SectionHeader
          title="核心指标"
          description="反映今日工作量和处理进度的关键数字"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            label="待处理"
            value={toProcess}
            hint={`待解析 ${unparsedResumes} · 解析中 ${parsingResumes} · 待筛选 ${pendingResumes}`}
            series={kpi.screenedDoneDaily}
            seriesLabel={`近 7 日已筛 ${kpi.weekScreenedDone} 份`}
            delta={screenedDoneDelta}
            deltaGoodWhen="up"
            icon={<Clock className="h-5 w-5" />}
            accent="accent"
          />
          <KpiCard
            label="已筛选"
            value={screenedResumes}
            hint={`通过率 ${passRate}%`}
            series={kpi.passRateDaily}
            seriesLabel="近 7 日通过率"
            delta={passRateDelta}
            deltaUnit="pp"
            deltaGoodWhen="up"
            icon={<CheckCircle2 className="h-5 w-5" />}
            accent="success"
          />
          <KpiCard
            label="错误数"
            value={errorResumes}
            hint={errorResumes > 0 ? '需关注解析/筛选异常' : '运行健康'}
            series={kpi.errorDaily}
            seriesLabel={`近 7 日新增 ${kpi.weekErrors} 起`}
            delta={errorDelta}
            deltaGoodWhen="down"
            icon={<AlertCircle className="h-5 w-5" />}
            accent={errorResumes > 0 ? 'destructive' : 'muted'}
          />
        </div>
      </section>

      {/* ====== 趋势分析 ====== */}
      <section>
        <SectionHeader
          title="趋势分析"
          description="近期简历收取走势"
        />
        <PositionTrendCompareChart
          emailConfigId={scope.emailConfigId}
          resumeSourceId={scope.resumeSourceId}
        />
      </section>

      {/* ====== 跟进看板 ====== */}
      <section>
        <SectionHeader
          title="跟进看板"
          description="候选人当前所处状态流转，岗位/时间段可筛选"
        />
        <FollowUpBoard emailConfigId={scope.emailConfigId} resumeSourceId={scope.resumeSourceId} />
      </section>
    </div>
  )
}
