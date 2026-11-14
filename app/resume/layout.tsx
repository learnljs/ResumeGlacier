'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Toaster } from '@/components/ui/toaster'
import { ConfirmDialogHost } from '@/components/ui/confirm-dialog'
import { DemoModeBanner } from '@/components/resume/DemoModeBanner'
import {
  BarChart3,
  ChevronDown,
  Menu,
  X,
  Settings,
  Users,
  ClipboardList,
} from 'lucide-react'
import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'

interface NavChild {
  href: string
  label: string
}

/** 叶子项直达一个路由；分组项只是容器，本身没有落地页 */
type NavItem =
  | { kind: 'group'; label: string; icon: LucideIcon; children: NavChild[] }
  | { kind: 'leaf'; href: string; label: string; icon: LucideIcon }

const navItems: NavItem[] = [
  { kind: 'leaf', href: '/resume/dashboard', label: '数据概览', icon: BarChart3 },
  { kind: 'leaf', href: '/resume/system-config', label: '系统配置', icon: Settings },
  {
    kind: 'group',
    label: '招聘中心',
    icon: Users,
    children: [
      { href: '/resume/list', label: '简历列表' },
      { href: '/resume/screened', label: '已筛选简历' },
      { href: '/resume/reevaluate', label: '简历复用评估' },
      { href: '/resume/follow-up', label: '跟进管理' },
    ],
  },
  { kind: 'leaf', href: '/resume/task-batches', label: '任务管理', icon: ClipboardList },
]

function isItemActive(item: NavItem, pathname: string) {
  if (item.kind === 'group') {
    return item.children.some((child) => pathname.startsWith(child.href))
  }
  return pathname.startsWith(item.href)
}

function isChildActive(
  child: NavChild,
  siblings: NavChild[],
  pathname: string
): boolean {
  if (pathname === child.href) {
    return true
  }
  
  const isPathUnderChild = pathname.startsWith(child.href + '/')
  if (!isPathUnderChild) {
    return false
  }
  
  const hasMoreSpecificSibling = siblings.some(
    (sibling) =>
      sibling.href !== child.href &&
      (pathname === sibling.href || pathname.startsWith(sibling.href + '/'))
  )
  
  return !hasMoreSpecificSibling
}

function NavItemRenderer({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem
  pathname: string
  onNavigate?: () => void
}) {
  const active = isItemActive(item, pathname)
  const [expanded, setExpanded] = useState(active)

  if (item.kind === 'group') {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors w-full',
            active
              ? 'text-sidebar-primary'
              : 'text-sidebar-muted-foreground hover:bg-sidebar-muted hover:text-sidebar-foreground'
          )}
        >
          <item.icon className="h-4 w-4" />
          <span className="flex-1 text-left">{item.label}</span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 transition-transform',
              expanded ? 'rotate-0' : '-rotate-90'
            )}
          />
        </button>
        {expanded && (
          <div className="ml-4 pl-3 border-l border-sidebar-border space-y-0.5 mt-0.5">
            {item.children.map((child) => {
              const childActive = isChildActive(child, item.children, pathname)
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={onNavigate}
                  className={cn(
                    'relative flex items-center rounded-lg px-3 py-2 text-sm transition-colors',
                    childActive
                      ? 'bg-sidebar-primary/15 text-sidebar-foreground font-medium'
                      : 'text-sidebar-muted-foreground hover:bg-sidebar-muted hover:text-sidebar-foreground'
                  )}
                >
                  {childActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-sidebar-primary" />
                  )}
                  {child.label}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'bg-sidebar-primary/15 text-sidebar-foreground'
          : 'text-sidebar-muted-foreground hover:bg-sidebar-muted hover:text-sidebar-foreground'
      )}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-sidebar-primary" />
      )}
      <item.icon className="h-4 w-4" />
      {item.label}
    </Link>
  )
}

export default function ResumeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="app-canvas min-h-screen bg-background">
      <Toaster />
      <ConfirmDialogHost />
      {/* Mobile header */}
      <div className="lg:hidden sticky top-0 z-50 flex items-center justify-between border-b bg-card px-4 h-14">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg hover:bg-muted"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold">简历智能筛选</h1>
        {/* 占位：与左侧菜单按钮等宽，保持标题居中 */}
        <div className="w-9" aria-hidden="true" />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-overlay/50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border p-4 animate-slide-in-right">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-semibold">导航</h2>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 rounded hover:bg-sidebar-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="space-y-1">
              {navItems.map((item) => (
                <NavItemRenderer
                  key={item.kind === 'group' ? item.label : item.href}
                  item={item}
                  pathname={pathname}
                  onNavigate={() => setSidebarOpen(false)}
                />
              ))}
            </nav>
          </div>
        </div>
      )}

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:border-r lg:border-sidebar-border lg:bg-sidebar lg:text-sidebar-foreground lg:min-h-screen lg:sticky lg:top-0">
          <div className="p-4 border-b border-sidebar-border">
            <h1 className="text-lg font-bold text-sidebar-foreground">简历智能筛选</h1>
            <p className="text-xs text-sidebar-muted-foreground mt-1">自动收取 / AI分析 / 智能筛选</p>
          </div>
          <nav className="flex-1 p-3 space-y-1">
            {navItems.map((item) => (
              <NavItemRenderer
                key={item.kind === 'group' ? item.label : item.href}
                item={item}
                pathname={pathname}
              />
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {/* 演示模式提示条：只在库里有演示数据时出现，给用户留一个退出入口 */}
          <DemoModeBanner />
          {children}
        </main>
      </div>    </div>
  )
}
