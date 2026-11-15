'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Mail, Bot, Tag, Briefcase, Share2, ScrollText, Users } from 'lucide-react'

const tabs = [
  { href: '/resume/system-config/email', label: '邮箱配置', icon: Mail },
  { href: '/resume/system-config/ai', label: 'AI模型', icon: Bot },
  { href: '/resume/system-config/sources', label: '简历来源', icon: Tag },
  { href: '/resume/system-config/positions', label: '职位管理', icon: Briefcase },
  { href: '/resume/system-config/prompts', label: '提示词管理', icon: ScrollText },
  { href: '/resume/system-config/webhooks', label: 'Webhook 集成', icon: Share2 },
  { href: '/resume/system-config/staff', label: '人员管理', icon: Users },
]

export default function SystemConfigLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div>
      <div className="border-b bg-card/50">
        <div className="px-6 pt-6 pb-0">
          <h2 className="text-2xl font-bold">系统配置</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            管理邮箱收取、AI模型、简历来源、职位信息与可登录人员
          </p>
          <nav className="flex gap-1 -mb-px">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                  pathname.startsWith(tab.href)
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      {children}
    </div>
  )
}
