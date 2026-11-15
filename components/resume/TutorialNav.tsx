'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown, List, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TutorialTreeNode } from '@/lib/services/tutorial-docs'

function NodeLink({
  node,
  pathname,
  onNavigate,
}: {
  node: TutorialTreeNode
  pathname: string
  onNavigate?: () => void
}) {
  // 无首页链接的分组（目录内无 README）仅展示标题文本，不可点击
  const active = !!node.href && pathname === node.href
  if (!node.href) {
    return (
      <div className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-foreground">
        {node.title}
      </div>
    )
  }
  return (
    <Link
      href={node.href ?? '#'}
      onClick={onNavigate}
      className={cn(
        'flex items-center rounded-lg px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-primary text-primary-foreground font-medium'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {node.title}
    </Link>
  )
}

/** 递归判断节点（含任意层级子项）是否包含当前路径 */
function containsPath(node: TutorialTreeNode, pathname: string): boolean {
  if (node.href && pathname === node.href) {
    return true
  }
  return (node.children ?? []).some((child) => containsPath(child, pathname))
}

function GroupNode({
  node,
  pathname,
  onNavigate,
}: {
  node: TutorialTreeNode
  pathname: string
  onNavigate?: () => void
}) {
  // 默认展开包含当前路径的分组（递归子分组）；教程总索引页展开全部分组便于浏览
  const containsCurrent = (node.children ?? []).some((child) =>
    containsPath(child, pathname)
  )
  const [expanded, setExpanded] = useState(
    containsCurrent || pathname === '/resume/about'
  )

  return (
    <div>
      <div className="flex items-center">
        {/* 分组标题本身链接到分组首页（目录 README） */}
        <div className="flex-1 min-w-0">
          <NodeLink node={node} pathname={pathname} onNavigate={onNavigate} />
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={expanded ? '收起分组' : '展开分组'}
        >
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 transition-transform',
              expanded ? 'rotate-0' : '-rotate-90'
            )}
          />
        </button>
      </div>
      {expanded && (
        <div className="ml-4 pl-3 border-l border-border space-y-0.5 mt-0.5">
          {(node.children ?? []).map((child) =>
            child.children ? (
              <GroupNode
                key={child.title}
                node={child}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            ) : (
              <NodeLink
                key={child.href}
                node={child}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            )
          )}
        </div>
      )}
    </div>
  )
}

/** 教程目录列表（桌面侧栏与移动端抽屉共用），目录树由服务端传入 */
export function TutorialNav({
  tree,
  onNavigate,
}: {
  tree: TutorialTreeNode[]
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  return (
    <nav className="space-y-1">
      {tree.map((node) =>
        node.children ? (
          <GroupNode
            key={node.title}
            node={node}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        ) : (
          <NodeLink
            key={node.href}
            node={node}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        )
      )}
    </nav>
  )
}

/** 移动端目录：顶部按钮 + 抽屉覆盖层 */
export function TutorialMobileNav({ tree }: { tree: TutorialTreeNode[] }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="lg:hidden sticky top-0 z-40 flex items-center gap-2 border-b bg-card px-4 h-12">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <List className="h-4 w-4" />
          教程目录
        </button>
      </div>
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-card border-r p-4 overflow-y-auto animate-slide-in-right">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">教程目录</h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-muted"
                aria-label="关闭目录"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <TutorialNav tree={tree} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}
