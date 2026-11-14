'use client'

import {
  PlusCircle,
  GitBranch,
  ThumbsUp,
  ThumbsDown,
  Tag as TagIcon,
  MessageSquare,
  Clock,
  Phone,
  RefreshCw,
  RotateCcw,
  History,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils/date'

/** 日志操作类型 → 中文标签 */
const LOG_ACTION_LABELS: Record<string, string> = {
  CREATE: '创建记录',
  BATCH_CREATE: '批量创建',
  STATUS_CHANGE: '状态变更',
  INTERVIEW_END: '面试结束',
  TAG_CHANGE: '标签变更',
  NOTE_CHANGE: '备注更新',
  INTERVIEW_TIME_CHANGE: '面试时间变更',
  START_DATE_CHANGE: '入职时间变更',
  CONTACT_RESULT_CHANGE: '联系结果变更',
  REFOLLOW: '重新跟进',
  UNSUITABLE: '标记不合适',
  REJECT_REASON_CHANGE: '拒绝原因更新',
  CANCEL_REASON_CHANGE: '取消原因更新',
  RESIGN_REASON_CHANGE: '离职原因更新',
  RESIGN_DATE_CHANGE: '离职日期变更',
  ROLLBACK: '回退',
}

/** 操作分类 → 图标、圆点颜色、徽章样式 */
const LOG_CATEGORY_MAP: Record<string, {
  icon: React.ComponentType<{ className?: string }>
  dotClass: string
  badgeClass: string
  badgeLabel: string
}> = {
  CREATE:              { icon: PlusCircle,    dotClass: 'bg-success/10', badgeClass: 'bg-success/10 text-success', badgeLabel: '创建' },
  BATCH_CREATE:        { icon: PlusCircle,    dotClass: 'bg-success/10', badgeClass: 'bg-success/10 text-success', badgeLabel: '创建' },
  STATUS_CHANGE:       { icon: GitBranch,     dotClass: 'bg-primary',     badgeClass: 'bg-primary/10 text-primary',       badgeLabel: '状态' },
  INTERVIEW_END:       { icon: ThumbsUp,      dotClass: 'bg-success/10',   badgeClass: 'bg-success/10 text-success',      badgeLabel: '面试' },
  TAG_CHANGE:          { icon: TagIcon,       dotClass: 'bg-warning/10',   badgeClass: 'bg-warning/10 text-warning',      badgeLabel: '标签' },
  NOTE_CHANGE:         { icon: MessageSquare, dotClass: 'bg-muted',   badgeClass: 'bg-muted text-muted-foreground',      badgeLabel: '备注' },
  INTERVIEW_TIME_CHANGE: { icon: Clock,       dotClass: 'bg-accent/10',  badgeClass: 'bg-accent/10 text-accent',     badgeLabel: '时间' },
  START_DATE_CHANGE:   { icon: Clock,          dotClass: 'bg-accent/10',  badgeClass: 'bg-accent/10 text-accent',     badgeLabel: '时间' },
  CONTACT_RESULT_CHANGE: { icon: Phone,        dotClass: 'bg-info/10',    badgeClass: 'bg-info/10 text-info',          badgeLabel: '联系' },
  REFOLLOW:            { icon: RefreshCw,      dotClass: 'bg-info',     badgeClass: 'bg-info/15 text-info',           badgeLabel: '跟进' },
  UNSUITABLE:          { icon: ThumbsDown,      dotClass: 'bg-destructive/10',     badgeClass: 'bg-destructive/10 text-destructive',           badgeLabel: '不合适' },
  REJECT_REASON_CHANGE: { icon: MessageSquare,  dotClass: 'bg-muted',  badgeClass: 'bg-muted text-muted-foreground',       badgeLabel: '原因' },
  CANCEL_REASON_CHANGE: { icon: MessageSquare,  dotClass: 'bg-muted',  badgeClass: 'bg-muted text-muted-foreground',       badgeLabel: '原因' },
  RESIGN_REASON_CHANGE: { icon: MessageSquare,  dotClass: 'bg-muted',  badgeClass: 'bg-muted text-muted-foreground',       badgeLabel: '原因' },
  RESIGN_DATE_CHANGE:   { icon: Clock,           dotClass: 'bg-accent/10', badgeClass: 'bg-accent/10 text-accent',     badgeLabel: '时间' },
  ROLLBACK:            { icon: RotateCcw,      dotClass: 'bg-accent/10', badgeClass: 'bg-accent/10 text-accent',    badgeLabel: '回退' },
}

/** 获取操作分类配置，未知类型回退到 STATUS_CHANGE */
function getLogCategory(action: string) {
  return LOG_CATEGORY_MAP[action] || LOG_CATEGORY_MAP['STATUS_CHANGE']
}

/** 跟进日志条目 */
export interface FollowUpLogItem {
  id: string
  action: string
  detail: string | null
  createdAt: string
}

interface FollowUpLogDrawerProps {
  open: boolean
  candidateName: string
  logs: FollowUpLogItem[]
  onClose: () => void
}

/**
 * 跟进日志抽屉：右侧滑入，时间线展示某条跟进记录的全部操作日志。
 */
export function FollowUpLogDrawer({ open, candidateName, logs, onClose }: FollowUpLogDrawerProps) {
  if (!open) return null

  return (
    <>
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 z-50 bg-overlay/50 animate-fade-in"
        onClick={onClose}
      />
      {/* 抽屉面板 */}
      <div className="fixed top-0 right-0 bottom-0 z-50 bg-background border-l shadow-card w-full sm:max-w-md lg:max-w-lg flex flex-col animate-slide-in-right">
        {/* Sticky 头部 */}
        <div className="sticky top-0 z-10 bg-background px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
              <History className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold leading-tight">跟进日志</h3>
              <p className="text-xs text-muted-foreground truncate max-w-[160px]">{candidateName}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="hover:bg-muted hover:text-current active:scale-95 transition-all duration-200"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* 可滚动内容区 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {logs.length === 0 ? (
            /* 空状态 */
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-16">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted/50">
                <History className="h-7 w-7 text-muted-foreground/60" />
              </div>
              <p className="text-sm font-medium">暂无日志</p>
              <p className="text-xs text-muted-foreground/70">该跟进记录暂无操作日志</p>
            </div>
          ) : (
            /* 时间线 */
            <div className="relative">
              {logs.map((log, index) => {
                const category = getLogCategory(log.action)
                const IconComp = category.icon
                const isLast = index === logs.length - 1

                return (
                  <div
                    key={log.id}
                    className="relative flex gap-3.5 pb-5 last:pb-0"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {/* 时间线圆点 + 连接线 */}
                    <div className="relative flex flex-col items-center shrink-0">
                      {/* 上方连接线（首项隐藏） */}
                      {index > 0 && (
                        <div className="absolute bottom-1/2 top-0 w-px bg-border" />
                      )}
                      {/* 彩色圆点 + 白色图标 */}
                      <div
                        className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 border-background ${category.dotClass} animate-timeline-dot-appear`}
                        style={{ animationDelay: `${index * 50 + 50}ms` }}
                      >
                        <IconComp className="h-3.5 w-3.5 text-on-solid" />
                      </div>
                      {/* 下方连接线（末项隐藏） */}
                      {!isLast && (
                        <div className="absolute top-1/2 bottom-0 w-px bg-border" />
                      )}
                    </div>

                    {/* 内容区 */}
                    <div className="flex-1 min-w-0 pt-1 pb-0.5">
                      {/* 操作类型 + 分类徽章 */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-sm font-semibold">
                          {LOG_ACTION_LABELS[log.action] || log.action}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${category.badgeClass}`}>
                          {category.badgeLabel}
                        </span>
                      </div>
                      {/* 详情卡片 */}
                      {log.detail && (
                        <div className="bg-muted/40 rounded-lg px-3 py-2.5 text-sm text-foreground/85 whitespace-pre-wrap leading-relaxed break-words">
                          {log.detail}
                        </div>
                      )}
                      {/* 时间戳 */}
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        {formatDateTime(log.createdAt)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
