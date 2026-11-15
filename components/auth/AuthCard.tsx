import type { ReactNode } from 'react'

/** 登录 / 初始化页的轻量外框，不依赖 /resume 布局，避免未登录时被侧栏困住 */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-7 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">ResumeGlacier</h1>
          <p className="mt-1 text-sm text-muted-foreground">AI 简历筛选系统</p>
        </div>
        <div className="rounded-xl border bg-card p-7">
          <h2 className="text-lg font-medium">{title}</h2>
          <p className="mt-1 mb-6 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
          {children}
        </div>
        {footer ? (
          <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
            {footer}
          </p>
        ) : null}
      </div>
    </main>
  )
}
