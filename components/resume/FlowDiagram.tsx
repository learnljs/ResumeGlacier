'use client'

import { Fragment } from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { STATUS_CN } from '@/lib/services/follow-up-transitions'
import { ResponsiveTooltip } from '@/components/ui/responsive-tooltip'

// 已筛选为批次入口，非跟进状态，需单独补中文名
const FLOW_STATUS_CN: Record<string, string> = { ...STATUS_CN, SCREENED: '已筛选' }

function statusCn(status: string): string {
  return FLOW_STATUS_CN[status] || status
}

interface FlowNodeData {
  status: string
  reached: number
  stayed: number
}

interface FlowBranchData {
  from: string
  to: string
  count: number
}

interface FlowData {
  batchTotal: number
  nodes: FlowNodeData[]
  branches: FlowBranchData[]
}

// 分支卡配色：不合适类红色调、offer 类金色调（对齐原型 fn-branch / fn-offer）
const BRANCH_VARIANTS: Record<string, { bar: string; name: string; num: string }> = {
  coral: {
    bar: 'bg-[#cf6353]',
    name: 'text-[#cf6353]',
    num: 'text-[#cf6353]',
  },
  gold: {
    bar: 'bg-[#c19a55]',
    name: 'text-[#c19a55]',
    num: 'text-[#c19a55]',
  },
  default: {
    bar: 'bg-muted-foreground/40',
    name: '',
    num: '',
  },
}

function branchVariant(to: string): 'coral' | 'gold' | 'default' {
  if (to === 'UNSUITABLE') return 'coral'
  if (to === 'OFFER_REJECTED' || to === 'INTERVIEW_CANCELLED') return 'gold'
  return 'default'
}

/** 正向节点卡：顶部色条 / 状态名 / 到达数 / 停留 */
function ForwardNodeCard({ status, reached, stayed }: FlowNodeData) {
  const isEntry = status === 'SCREENED'
  return (
    <ResponsiveTooltip
      content={
        isEntry ? (
          <>
            本批投递共 {reached} 条 · 停留 {stayed}
            <br />
            本批 = 所选时间范围内首次进入「已筛选」的投递；停留 = 尚未开始跟进的投递数
          </>
        ) : (
          <>
            到达 {reached} · 停留 {stayed}
            <br />
            到达 = 这批投递中曾经到达「{statusCn(status)}」的数量（同一投递只计一次）
            <br />
            停留 = 到达后未再流转、当前停在「{statusCn(status)}」的数量，与上方状态卡「{statusCn(status)}」计数一致
          </>
        )
      }
    >
      <div className="w-[80px] shrink-0 overflow-hidden rounded-lg border bg-background shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
        <div className={`h-0.5 ${isEntry ? 'bg-muted-foreground/40' : 'bg-primary'}`} />
        <div className="border-b px-2 pt-1.5 pb-1 text-center text-xs font-medium whitespace-nowrap">
          {statusCn(status)}
        </div>
        <div className="px-2 pt-1.5 text-center text-2xl font-bold leading-tight tabular-nums">
          {reached}
        </div>
        <div className="flex items-baseline justify-center gap-1 px-2 pt-0.5 pb-1.5 text-[11px] text-muted-foreground">
          停留
          <b className="text-sm font-semibold text-foreground/80 tabular-nums">{stayed}</b>
        </div>
      </div>
    </ResponsiveTooltip>
  )
}

/** 分支卡：顶部色条 / 状态名 / 流出数量（不标停留） */
function BranchCard({ from, to, count }: FlowBranchData) {
  const variant = BRANCH_VARIANTS[branchVariant(to)]
  return (
    <div className="w-[80px] shrink-0 overflow-hidden rounded-lg border bg-background shadow-sm transition-all hover:shadow-md">
      <div className={`h-0.5 ${variant.bar}`} />
      <div
        className={`border-b px-2 pt-1.5 pb-1 text-center text-xs font-medium whitespace-nowrap ${variant.name}`}
      >
        {statusCn(to)}
      </div>
      <div
        className={`px-2 py-1 text-center text-2xl font-bold leading-tight tabular-nums ${variant.num}`}
      >
        {count}
      </div>
    </div>
  )
}

/** 正向连线：填满卡片间隙的水平线 + 右端箭头（紧贴右侧卡片） */
function ForwardConnector({ from, to, count }: { from: string; to: string; count: number }) {
  return (
    <ResponsiveTooltip
      content={
        <>
          「{statusCn(from)}」→「{statusCn(to)}」：{count} 条
          <br />
          = 这批投递中从「{statusCn(from)}」流转到「{statusCn(to)}」的数量；被回退撤销的流转不计
        </>
      }
    >
      <div className="relative flex flex-1 min-w-0 items-center self-stretch">
        <div className="absolute inset-x-0 top-1/2 h-[1.5px] -translate-y-1/2 bg-muted-foreground/40" />
        <ChevronRight className="absolute -right-1 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </ResponsiveTooltip>
  )
}

/**
 * 周报流转图：卡片节点图（7 正向节点 + 7 条流失分支）。
 * 正向线数量 = 右侧节点到达数（正向节点只有一条流入线），对应 doc/product/跟进看板设计.md §4.3
 */
export function FlowDiagram({ data, loading }: { data: FlowData | null; loading: boolean }) {
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data || data.batchTotal === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        所选时间范围内暂无投递
      </p>
    )
  }

  const nodes = data.nodes
  const branches = data.branches

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        {/* 正向推进：7 节点固定宽，连线填满卡片间隙（两端与卡片无缝衔接） */}
        <div className="flex">
          {nodes.map((node, i) => (
            <Fragment key={node.status}>
              <ForwardNodeCard {...node} />
              {i < nodes.length - 1 && (
                <ForwardConnector
                  from={node.status}
                  to={nodes[i + 1].status}
                  count={nodes[i + 1].reached}
                />
              )}
            </Fragment>
          ))}
        </div>

        {/* 流失 / 终止：竖线 + ▼ + 分支卡，与上方节点同列对齐（同构固定宽 + 空位 flex-1） */}
        <div className="mt-1 flex">
          {branches.map((branch, i) => (
            <Fragment key={`${branch.from}-${branch.to}`}>
              <ResponsiveTooltip
                content={
                  <>
                    「{statusCn(branch.from)}」→「{statusCn(branch.to)}」：{branch.count} 条
                    <br />
                    = 这批投递中从「{statusCn(branch.from)}」流出到「{statusCn(branch.to)}」的数量；被回退撤销的流转不计
                  </>
                }
              >
                <div className="flex shrink-0 flex-col items-center">
                  <div className="h-4 w-[1.5px] bg-muted-foreground/40" />
                  <ChevronDown className="h-4 w-4 -mt-1 text-muted-foreground" />
                  <div className="mt-1">
                    <BranchCard {...branch} />
                  </div>
                </div>
              </ResponsiveTooltip>
              {i < branches.length - 1 && <div className="flex-1" />}
            </Fragment>
          ))}
        </div>

        {/* 图例 */}
        <div className="flex flex-wrap gap-5 mt-4 pt-2.5 border-t border-dashed text-xs text-muted-foreground">
          <span>→ 正向推进</span>
          <span>▼ 流失 / 终止（下方数字为流出数量）</span>
          <span>悬停节点 / 连线可查看口径说明</span>
        </div>
      </div>
    </div>
  )
}
