'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { MultiSelect } from '@/components/ui/multi-select'
import { BoardPeriodPicker, getDefaultBoardPeriod } from '@/components/resume/BoardPeriodPicker'
import type { BoardPeriod } from '@/components/resume/BoardPeriodPicker'
import { FlowDiagram } from '@/components/resume/FlowDiagram'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import {
  FOLLOW_UP_STATUSES,
  STATUS_CN,
} from '@/lib/services/follow-up-transitions'
import { apiGet } from '@/lib/api/client'

interface FollowUpBoardData {
  statusCounts: Record<string, number>
  total: number
  batchTotal: number
  contacted: {
    total: number
    counts: Record<string, number>
  }
}

interface FollowUpBoardFlowData {
  batchTotal: number
  nodes: Array<{ status: string; reached: number; stayed: number }>
  branches: Array<{ from: string; to: string; count: number }>
}

// 是否联系上三段（仅沟通中投递）：颜色走语义令牌，避免硬编码 hex 在换主题时串色
const CONTACTED_SEGMENTS = [
  { key: 'NOT_CONTACTED', label: '未尝试', color: 'hsl(var(--muted-foreground))' },
  { key: 'CONTACTED', label: '已联系上', color: 'hsl(var(--success))' },
  { key: 'CONTACT_FAILED', label: '未联系上', color: 'hsl(var(--warning))' },
] as const

/**
 * 跟进看板 · 当前状态统计
 *
 * 岗位多选（默认全部岗位）+ 投递时间段筛选（起止日期手动输入 + 周/月快捷，默认本周）+ 10 个状态卡，
 * 展示所选岗位范围内、指定时间段内投递的人当前处于各状态的数量。
 * 对应文档：doc/product/跟进看板设计.md §4.1
 */
interface FollowUpBoardProps {
  /** 数据范围：邮箱维度；不传表示全部 */
  emailConfigId?: string
  /** 数据范围：来源维度；不传表示全部 */
  resumeSourceId?: string
}

export function FollowUpBoard({ emailConfigId, resumeSourceId }: FollowUpBoardProps = {}) {
  const [positions, setPositions] = useState<{ id: string; title: string }[]>([])
  const [selectedPositionIds, setSelectedPositionIds] = useState<string[]>([])
  const [period, setPeriod] = useState<BoardPeriod>(() => getDefaultBoardPeriod())
  const [data, setData] = useState<FollowUpBoardData | null>(null)
  const [flowData, setFlowData] = useState<FollowUpBoardFlowData | null>(null)
  const [loading, setLoading] = useState(true)
  // 请求序号：快速切换岗位/时间段时只采纳最新一次请求的响应，丢弃过期响应
  const reqIdRef = useRef(0)

  // 加载启用中岗位列表（停用岗位不出现）
  useEffect(() => {
    apiGet<{ positions?: { id: string; title: string }[] }>('/api/positions')
      .then((json) => setPositions(json.positions || []))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : '加载职位失败'
        toast.error(msg)
      })
  }, [])

  // 加载状态统计与周报流转图（岗位 / 时间段变化后按新范围重新统计，并行请求）
  const loadStats = useCallback(async () => {
    // 每次发起请求递增序号；响应返回时序号已不是最新，说明有更新的请求，丢弃本次结果
    const reqId = ++reqIdRef.current
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (selectedPositionIds.length > 0) {
        params.set('positionIds', selectedPositionIds.join(','))
      }
      params.set('from', period.from)
      params.set('to', period.to)
      // 与看板上方同属一个数据范围：邮箱 / 来源切换后本区块同步重算
      if (emailConfigId) params.set('emailConfigId', emailConfigId)
      if (resumeSourceId) params.set('resumeSourceId', resumeSourceId)

      const [statsJson, flowJson] = await Promise.all([
        apiGet<FollowUpBoardData>(`/api/dashboard/follow-up-board/stats?${params.toString()}`),
        apiGet<FollowUpBoardFlowData>(`/api/dashboard/follow-up-board/flow?${params.toString()}`),
      ])
      if (reqId !== reqIdRef.current) return // 过期响应，不写入
      setData(statsJson)
      setFlowData(flowJson)
    } catch (err: unknown) {
      if (reqId !== reqIdRef.current) return // 过期响应，不提示错误
      const msg = err instanceof Error ? err.message : '加载失败'
      toast.error(msg)
    } finally {
      // 仅最新请求负责收尾 loading，避免被先返回的旧请求提前关闭
      if (reqId === reqIdRef.current) setLoading(false)
    }
  }, [selectedPositionIds, period, emailConfigId, resumeSourceId])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  // 环形图数据：按固定顺序映射为 recharts 数据行（缺失补 0，占比四舍五入）
  const contactedSegments = data
    ? CONTACTED_SEGMENTS.map((seg) => {
        const value = data.contacted.counts[seg.key] ?? 0
        const pct =
          data.contacted.total > 0 ? Math.round((value / data.contacted.total) * 100) : 0
        return { key: seg.key, label: seg.label, color: seg.color, value, pct }
      })
    : []

  // 联系进度：已联系上 / 沟通中总数，供内环进度弧与中心文案使用
  const contactRate =
    data && data.contacted.total > 0
      ? Math.round(((data.contacted.counts.CONTACTED ?? 0) / data.contacted.total) * 100)
      : 0

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {/* 标题行：跟进看板 + 时间段选择（起止日期手动输入 + 周/月快捷） */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-semibold">跟进看板</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              按岗位统计：可多选岗位，默认「全部岗位」（同一候选人投多个岗位各计一次）；
              时间段默认本周，可手动输入起止日期或按周快捷选取
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <BoardPeriodPicker value={period} onChange={setPeriod} />
          </div>
        </div>

        {/* 岗位多选（与上方页签 Row 2 一致）+ 已筛选岗位 chips */}
        <div className="flex items-center gap-3 flex-wrap">
          <MultiSelect
            options={positions.map((p) => ({ value: p.id, label: p.title }))}
            value={selectedPositionIds}
            onChange={setSelectedPositionIds}
            placeholder="全部岗位"
            showSelectAll
            className="w-full sm:w-[240px]"
          />
          {selectedPositionIds.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {selectedPositionIds.map((id) => {
                const pos = positions.find((p) => p.id === id)
                if (!pos) return null
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground"
                  >
                    {pos.title}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedPositionIds((prev) => prev.filter((v) => v !== id))
                      }
                      className="rounded-full p-0.5 hover:bg-background transition-colors"
                      title={`移除「${pos.title}」`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* 10 状态卡 */}
        {loading && !data ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-3">
              {FOLLOW_UP_STATUSES.map((status) => (
                <Card key={status} className="relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary" />
                  <CardContent className="p-3 text-center">
                    <p
                      className={`text-2xl font-bold tabular-nums ${
                        status === 'UNSUITABLE' ? 'text-destructive' : 'text-foreground'
                      }`}
                    >
                      {data.statusCounts[status] ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 whitespace-nowrap">
                      {STATUS_CN[status]}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
            {/* 状态卡与流转图的批次对账说明 */}
            <p className="text-xs text-muted-foreground">
              范围内投递共 {data.batchTotal} 条：上方 10 个状态合计 {data.total} 条
              {data.batchTotal - data.total > 0 && (
                <>，另有 {data.batchTotal - data.total} 条已通过初筛、尚未开始跟进（计入流转图「已筛选」停留）</>
              )}
              。
            </p>

            {/* 是否联系上环形图 + 周报流转图（左右并排，xl 以下堆叠） */}
            <div className="border-t pt-4 grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
              {/* 是否联系上（仅统计范围内「沟通中」投递） */}
              <div className="min-w-0">
                <div>
                  <h4 className="text-sm font-semibold">是否联系上</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    仅统计范围内「沟通中」投递
                  </p>
                </div>
                {data.contacted.total === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    暂无沟通中投递
                  </p>
                ) : (
                  <div className="flex flex-col items-center gap-6 mt-4 md:flex-row xl:flex-col">
                    {/* 双层环：外环=联系结果构成，内环=联系进度；中心放总量与完成率 */}
                    <div className="relative h-48 w-48 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={contactedSegments}
                            dataKey="value"
                            nameKey="label"
                            innerRadius="72%"
                            outerRadius="98%"
                            paddingAngle={2}
                            strokeWidth={0}
                            startAngle={90}
                            endAngle={-270}
                          >
                            {contactedSegments.map((seg) => (
                              <Cell key={seg.key} fill={seg.color} />
                            ))}
                          </Pie>
                          <Pie
                            data={[
                              { name: '已联系', value: contactRate },
                              { name: '未联系', value: 100 - contactRate },
                            ]}
                            dataKey="value"
                            innerRadius="48%"
                            outerRadius="58%"
                            startAngle={90}
                            endAngle={-270}
                            strokeWidth={0}
                            isAnimationActive={false}
                          >
                            <Cell fill="hsl(var(--accent))" />
                            <Cell fill="hsl(var(--muted))" />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-2xl font-bold leading-none tabular-nums">
                          {data.contacted.total}
                        </span>
                        <span className="mt-1 text-[11px] text-muted-foreground">沟通中</span>
                        <span className="mt-1.5 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-accent">
                          已联系 {contactRate}%
                        </span>
                      </div>
                    </div>
                    {/* 图例：数量 + 占比 */}
                    <div className="flex flex-col gap-2 w-full md:w-56">
                      {contactedSegments.map((seg) => (
                        <div
                          key={seg.key}
                          className="flex items-center justify-between gap-4 text-sm"
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: seg.color }}
                            />
                            {seg.label}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            {seg.value}（{seg.pct}%）
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {/* 周报流转图：所选时间窗口内首次进入已筛选的投递批次，净重放后展示到达/停留与流失 */}
              <div className="min-w-0">
                <div>
                  <h4 className="text-sm font-semibold">周报流转图</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    所选时间范围内进入「已筛选」的投递视为一批，展示各状态的到达数量与流转去向；到达数为历史累计（含已流转走的），状态卡与环形图为当前停留数量
                  </p>
                </div>
                <div className="mt-3">
                  <FlowDiagram data={flowData} loading={loading} />
                </div>
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
